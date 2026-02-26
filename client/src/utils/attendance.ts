export interface SimpleAttendee {
    id: any;
    kind: 'USER' | 'GUEST';
}

/**
 * Returns a list of unique attendees from a list that might contain duplicates.
 * Preserves the first instance encountered.
 */
export const getUniqueAttendees = <T extends SimpleAttendee>(attendees: T[]): T[] => {
    const seen = new Set<string>();
    return attendees.filter(a => {
        if (!a.id) return false;
        // If populated, use a.id._id. If not populated (ObjectId), use a.id directly.
        const id = typeof a.id === 'object' && a.id._id ? a.id._id : a.id;
        const idStr = id.toString();

        if (seen.has(idStr)) return false;
        seen.add(idStr);
        return true;
    });
};

/**
 * Returns the count of unique, non-null IDs in an attendee list.
 */
export const getUniqueAttendanceCount = (attendees: SimpleAttendee[]): number => {
    const ids = new Set<string>();
    attendees.forEach(a => {
        if (!a.id) return;
        const id = typeof a.id === 'object' && a.id._id ? a.id._id : a.id;
        ids.add(id.toString());
    });
    return ids.size;
};
