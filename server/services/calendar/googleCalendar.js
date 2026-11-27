/**
 * Google Calendar client used by reminderService, for one user's signed-in
 * Google account (services/google/connectors.js builds it).
 *
 * Events are timed (30 minutes at the reminder's due time) with a popup alert.
 */
const { calendar: calendarApi } = require("@googleapis/calendar");

function createGoogleCalendar(oauth, { calendarId, timeZone }) {
  const api = calendarApi({ version: "v3", auth: oauth });

  const toBody = ({ summary, description, start, end }) => ({
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] },
  });

  return {
    async createEvent(event) {
      const response = await api.events.insert({ calendarId, requestBody: toBody(event) });
      return response.data.id;
    },

    async updateEvent(eventId, event) {
      await api.events.patch({ calendarId, eventId, requestBody: toBody(event) });
    },

    /**
     * The calendar's own timezone (Google shows events in it). Readable with
     * the events permission alone: listing events reports it.
     */
    async timeZone() {
      const response = await api.events.list({ calendarId, maxResults: 1, singleEvents: true, timeMin: new Date().toISOString() });
      return response.data.timeZone ?? null;
    },

    async deleteEvent(eventId) {
      try {
        await api.events.delete({ calendarId, eventId });
      } catch (error) {
        // Already deleted by hand in Google Calendar: nothing to do.
        if (error.code === 404 || error.code === 410) return;
        throw error;
      }
    },
  };
}

module.exports = { createGoogleCalendar };
