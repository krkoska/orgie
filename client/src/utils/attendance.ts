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
        const id = typeof a.id === 'string' ? a.id : a.id?._id;
        if (!id || seen.has(id.toString())) return false;
        seen.add(id.toString());
        return true;
    });
};

/**
 * Returns the count of unique, non-null IDs in an attendee list.
 */
export const getUniqueAttendanceCount = (attendees: SimpleAttendee[]): number => {
    const ids = new Set<string>();
    attendees.forEach(a => {
        const id = typeof a.id === 'string' ? a.id : a.id?._id;
        if (id) ids.add(id.toString());
    });
    return ids.size;
};
