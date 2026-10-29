// =====================================================================
//  CLIENTE MÍNIMO de Google OAuth 2.0 + Google Calendar API v3.
//  Usa fetch nativo (sin SDK): menos dependencias = menos superficie de
//  ataque. Solo pide el permiso "calendar.events" (leer/escribir eventos),
//  no acceso total a la cuenta de Google.
// =====================================================================
const crypto = require("crypto");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

class GoogleError extends Error {
  constructor(status, mensaje, razon) {
    super(mensaje);
    this.name = "GoogleError";
    this.status = status;
    this.razon = razon;
  }
}

class GoogleCalendarClient {
  /** @param {{clientId:string, clientSecret:string, redirectUri:string}} config @param {typeof fetch} [fetchImpl] */
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  /** PKCE: el "verifier" se queda en el servidor y Google recibe solo su hash. */
  static pkce() {
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
  }

  urlAutorizacion({ state, challenge, loginHint }) {
    const p = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",          // para recibir refresh_token
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    if (loginHint) p.set("login_hint", loginHint);
    return `${AUTH_URL}?${p}`;
  }

  async #token(params) {
    const res = await this.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...params }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new GoogleError(res.status, data.error_description || data.error || "Error de Google OAuth", data.error);
    return data;
  }

  canjearCodigo(code, verifier) {
    return this.#token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: this.config.redirectUri });
  }

  renovar(refreshToken) {
    return this.#token({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async revocar(token) {
    await this.fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }

  /** Lee el correo del id_token. Viene directo de Google por HTTPS en el canje del código. */
  static correoDeIdToken(idToken) {
    try {
      const payload = JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8"));
      return payload.email_verified === false ? null : payload.email || null;
    } catch {
      return null;
    }
  }

  async #api(accessToken, metodo, ruta, { query, body } = {}) {
    const url = `${API}${ruta}${query ? `?${new URLSearchParams(query)}` : ""}`;
    const res = await this.fetch(url, {
      method: metodo,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body && { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = data.error || {};
      throw new GoogleError(res.status, e.message || `Google Calendar respondió ${res.status}`, e.errors?.[0]?.reason || e.status);
    }
    return data;
  }

  listarEventos(token, calendarId, { syncToken, pageToken, timeMin }) {
    const query = { singleEvents: "true", maxResults: "250" };
    if (syncToken) Object.assign(query, { syncToken, showDeleted: "true" });
    else if (timeMin) query.timeMin = timeMin;
    if (pageToken) query.pageToken = pageToken;
    return this.#api(token, "GET", `/calendars/${encodeURIComponent(calendarId)}/events`, { query });
  }

  crearEvento(token, calendarId, evento, { conMeet = false, notificar = false } = {}) {
    const query = { sendUpdates: notificar ? "all" : "none" };
    if (conMeet) query.conferenceDataVersion = "1";
    return this.#api(token, "POST", `/calendars/${encodeURIComponent(calendarId)}/events`, { query, body: evento });
  }

  actualizarEvento(token, calendarId, eventId, evento, { notificar = false } = {}) {
    return this.#api(token, "PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      query: { sendUpdates: notificar ? "all" : "none" }, body: evento,
    });
  }

  eliminarEvento(token, calendarId, eventId, { notificar = false } = {}) {
    return this.#api(token, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      query: { sendUpdates: notificar ? "all" : "none" },
    });
  }

  /** Suscripción a avisos en tiempo real (webhook). Google exige una URL pública HTTPS. */
  vigilar(token, calendarId, { id, address, secreto, ttlSegundos = 7 * 24 * 3600 }) {
    return this.#api(token, "POST", `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
      body: { id, type: "web_hook", address, token: secreto, params: { ttl: String(ttlSegundos) } },
    });
  }

  detenerCanal(token, { id, resourceId }) {
    return this.#api(token, "POST", "/channels/stop", { body: { id, resourceId } });
  }
}

GoogleCalendarClient.GoogleError = GoogleError;
module.exports = GoogleCalendarClient;
