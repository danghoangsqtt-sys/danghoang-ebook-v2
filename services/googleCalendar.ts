
import { CalendarEvent } from "../types";

class GoogleCalendarService {
    private getAccessToken() {
        // Lấy token từ localStorage (được lưu khi đăng nhập)
        const profile = localStorage.getItem('dh_user_profile');
        if (profile) {
            const parsed = JSON.parse(profile);
            return parsed.accessToken;
        }
        return null;
    }

    async listEvents(timeMin?: string, timeMax?: string): Promise<CalendarEvent[]> {
        const token = this.getAccessToken();
        if (!token) throw new Error("NO_TOKEN");

        const min = timeMin || new Date().toISOString();
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${min}&singleEvents=true&orderBy=startTime`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            throw new Error("TOKEN_EXPIRED");
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Failed to fetch events");
        }

        const data = await response.json();

        // Map Google Events to App Events
        return data.items.map((item: any) => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // Local ID
            title: item.summary || '(Không có tiêu đề)',
            start: item.start.dateTime || item.start.date,
            end: item.end.dateTime || item.end.date,
            color: 'bg-blue-500 border-blue-600', // Default color for Google Events
            description: item.description,
            location: item.location,
            googleEventId: item.id
        }));
    }

    async createEvent(event: CalendarEvent): Promise<string> {
        const token = this.getAccessToken();
        if (!token) throw new Error("NO_TOKEN");

        const eventBody = {
            summary: event.title,
            description: event.description || "Created via DangHoang Ebook Planner",
            start: {
                dateTime: new Date(event.start).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            end: {
                dateTime: new Date(event.end).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }
        };

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventBody)
        });

        if (response.status === 401) {
            throw new Error("TOKEN_EXPIRED");
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Failed to create event");
        }

        const data = await response.json();
        return data.id;
    }
}

export const googleCalendarService = new GoogleCalendarService();