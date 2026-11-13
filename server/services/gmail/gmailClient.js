/**
 * The parts of the Gmail API the app uses, for one user's Google account.
 * What each method may do depends on the connector the user turned on:
 * sending (the digest, to themselves), saving drafts, or reading.
 */
const { gmail: gmailApi } = require("@googleapis/gmail");

const MAX_LISTED = 25;

function createGmailClient(oauth) {
  const api = gmailApi({ version: "v1", auth: oauth });

  return {
    /** Sends a message. Only used for the digest, which goes to the user's own address. */
    async sendMessage(mail) {
      const response = await api.users.messages.send({ userId: "me", requestBody: { raw: buildRawMessage(mail) } });
      return response.data.id;
    },

    /** Saves a message in the user's Drafts folder. It is not sent. */
    async createDraft(mail) {
      const response = await api.users.drafts.create({ userId: "me", requestBody: { message: { raw: buildRawMessage(mail) } } });
      return response.data.id;
    },

    /** Ids of messages matching a Gmail search such as "from:(a@x.com) after:1730000000". */
    async listMessageIds(query) {
      const response = await api.users.messages.list({ userId: "me", q: query, maxResults: MAX_LISTED });
      return (response.data.messages ?? []).map((message) => message.id);
    },

    /** Sender, subject, Gmail's short snippet and when it arrived. The body is not fetched. */
    async getMessageSummary(id) {
      const { data } = await api.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject"],
      });
      const header = (name) => data.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      return {
        id: data.id,
        from: header("From"),
        subject: header("Subject"),
        snippet: data.snippet ?? "",
        receivedAt: new Date(Number(data.internalDate)).toISOString(),
      };
    },
  };
}

/** A MIME message (plain text, plus HTML when given) as Gmail's base64url "raw" string. */
function buildRawMessage({ to, subject, text, html }) {
  const headers = [`To: ${to ?? ""}`, `Subject: ${encodeHeader(subject ?? "")}`, "MIME-Version: 1.0"];
  const part = (type, body) =>
    [`Content-Type: ${type}; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", wrapBase64(body)].join("\r\n");

  let message;
  if (html) {
    const boundary = `jc-${Date.now().toString(36)}`;
    message = [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      part("text/plain", text ?? ""),
      `--${boundary}`,
      part("text/html", html),
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    message = [...headers, part("text/plain", text ?? "")].join("\r\n");
  }
  return Buffer.from(message).toString("base64url");
}

/** RFC 2047 encoding, so a subject with accents or dashes arrives intact. */
function encodeHeader(value) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function wrapBase64(body) {
  return Buffer.from(body).toString("base64").replace(/.{76}/g, "$&\r\n");
}

module.exports = { createGmailClient, buildRawMessage };
