var OAUTH2_LIBRARY = '1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF';

function getOAuthService() {
  return OAuth2.createService('GmailAddon')
    .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/auth')
    .setTokenUrl('https://accounts.google.com/o/oauth2/token')
    .setClientId('18186682441-h35mvc65v0h5e99rvn4r807ftgsu0l5n.apps.googleusercontent.com')
    .setClientSecret('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')
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.addons.execute https://www.googleapis.com/auth/gmail.addons.current.message.readonly https://www.googleapis.com/auth/script.external_request')
    .setParam('access_type', 'offline')
    .setParam('approval_prompt', 'force');
}

function authCallback(request) {
  var oauthService = getOAuthService();
  var isAuthorized = oauthService.handleCallback(request);
  if (isAuthorized) {
    return HtmlService.createHtmlOutput('Success! You can close this tab.');
  } else {
    return HtmlService.createHtmlOutput('Denied. You can close this tab');
  }
}

function getOAuthUrl() {
  var oauthService = getOAuthService();
  if (!oauthService.hasAccess()) {
    var authorizationUrl = oauthService.getAuthorizationUrl();
    Logger.log('Open the following URL and re-run the script: %s', authorizationUrl);
    return CardService.newCardBuilder()
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText("Please authorize the add-on by visiting the following URL: " + authorizationUrl)))
      .build();
  }
}

function getMessageDetailsWithOAuth(messageId) {
  var oauthService = getOAuthService();

  if (!oauthService.hasAccess()) {
    Logger.log('No OAuth access');
    return getOAuthUrl();
  }

  var accessToken = oauthService.getAccessToken();
  var url = 'https://www.googleapis.com/gmail/v1/users/me/messages/' + messageId + '?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=From';
  var options = {
    headers: {
      'Authorization': 'Bearer ' + accessToken
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var message = JSON.parse(response.getContentText());

  if (message.error && message.error.code === 401) {
    Logger.log('Invalid or expired access token. Attempting to refresh token.');

    if (oauthService.getRefreshToken()) {
      oauthService.refresh();
      accessToken = oauthService.getAccessToken();
      options.headers['Authorization'] = 'Bearer ' + accessToken;
      response = UrlFetchApp.fetch(url, options);
      message = JSON.parse(response.getContentText());
    } else {
      oauthService.reset();
      return getOAuthUrl();
    }
  }

  Logger.log('Message details: ' + JSON.stringify(message));
  return message;
}

function getContextualAddOn(e) {
  Logger.log('Event object: ' + JSON.stringify(e));

  var messageId = null;
  if (e.gmail && e.gmail.messageId) {
    messageId = e.gmail.messageId;
  }

  Logger.log('Extracted Message ID: ' + messageId);

  if (!messageId) {
    return CardService.newCardBuilder()
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText("Failed to retrieve message ID.")))
      .build();
  }

  return handleGetMessageInfo({ parameters: { messageId: messageId } });
}

function handleGetMessageInfo(e) {
  var messageId = e.parameters.messageId;
  Logger.log('Message ID: ' + messageId);

  var messageDetails = getMessageDetailsWithOAuth(messageId);

  var card = CardService.newCardBuilder();
  var section = CardService.newCardSection();

  if (messageDetails && messageDetails.payload && messageDetails.payload.headers) {
    var recipient = 'unknown';
    var subject = 'No Subject';
    var sender = 'unknown';

    for (var i = 0; i < messageDetails.payload.headers.length; i++) {
      var header = messageDetails.payload.headers[i];
      Logger.log('Header: ' + JSON.stringify(header));
      if (header.name === 'To') {
        recipient = header.value.split(',')[0].trim();
      }
      if (header.name === 'Subject') {
        subject = header.value;
      }
      if (header.name === 'From') {
        sender = header.value;
      }
    }

    section.addWidget(CardService.newTextParagraph().setText("Subject: " + `[넷킬러] "${subject}" 기술지원 만족도 조사`));
    section.addWidget(CardService.newTextParagraph().setText("Recipient: " + recipient));
    section.addWidget(CardService.newTextParagraph().setText("Sender: " + sender));

    card.addSection(section);

    var emailBody = `
안녕하세요, ${recipient} 님<br><br>
고객님의 문의 케이스 "${subject}" 가 해결되셨나요? Netkiller 기술지원팀이 만족스러운 도움을 받으셨을까요?<br><br>
Netkiller 기술지원팀의 서비스 향상을 위하여, 최근 도움드린 케이스 "${subject}"에 대한 간단한 만족도 조사 설문에 참여를<br>
부탁드립니다. 대략 2~3분 소요됩니다.<br><br>
이 문제와 관련해 아직 지원이 더 필요한 경우, 본 이메일에 답장하시면 본 케이스를 지원요청 상태로 변경하실 수 있습니다.<br><br>
<a href="https://forms.gle/Pi1ELqRwPrKKyn1z8">설문조사 참여하기</a><br><br>
Netkiller 서비스를 이용해 주셔서 감사합니다.<br><br>
— Netkiller 기술지원팀
`;

    var emailSection = CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText("Email body:"))
      .addWidget(CardService.newTextParagraph().setText(emailBody));

    card.addSection(emailSection);

    var sendEmailButton = CardService.newTextButton()
      .setText("Send Email")
      .setOnClickAction(CardService.newAction()
        .setFunctionName("sendEmail")
        .setParameters({ recipient: recipient, subject: subject }));

    card.addSection(CardService.newCardSection().addWidget(sendEmailButton));
  } else {
    section.addWidget(CardService.newTextParagraph().setText("Failed to retrieve message details."));
  }

  return card.build();
}

// Function to send the email
function sendEmail(e) {
  var recipient = e.parameters.recipient;
  var subject = e.parameters.subject;
  var sender = "support@netkiller.com"; // 특정 발송 이메일 주소
  var emailSubject = `[넷킬러] ${subject} 기술지원 만족도 조사`;
  var body = `
안녕하세요, ${recipient} 님<br><br>
고객님의 문의 케이스 "${subject}" 가 해결되셨나요? Netkiller 기술지원팀의 만족스러운 도움을 받으셨을까요?<br><br>
Netkiller 기술지원팀의 서비스 향상을 위하여, 최근 도움드린 케이스 "${subject}"에 대한 간단한 만족도 조사 설문에 참여를<br>
부탁드립니다. 대략 2~3분 소요됩니다.<br><br>
이 문제와 관련해 아직 지원이 더 필요한 경우, 본 이메일에 답장하시면 본 케이스를 지원요청 상태로 변경하실 수 있습니다.<br><br>
<a href="https://forms.gle/Pi1ELqRwPrKKyn1z8">설문조사 참여하기</a><br><br>
Netkiller 서비스를 이용해 주셔서 감사합니다.<br><br>
— Netkiller 기술지원팀
`;

  GmailApp.sendEmail(recipient, emailSubject, '', {
    from: sender,
    htmlBody: body,
    cc: 'support@netkiller.com'
  });

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Email sent successfully"))
    .build();
}

function onGmailAuthorization() {
  return CardService.newAuthorizationException()
    .setAuthorizationUrl('https://accounts.google.com/o/oauth2/auth')
    .setResourceDisplayName('Google')
    .setCustomUiCallback('getContextualAddOn');
}
