import React, { createContext, useContext, useState, type ReactNode } from 'react';

type Language = 'en' | 'cs';

interface Translations {
    [key: string]: {
        en: string;
        cs: string;
    };
}

const translations: Translations = {
    // Auth & Nav
    'login': { en: 'Login', cs: 'Přihlásit se' },
    'sessionExpired': { en: 'Your session has expired.', cs: 'Tvoje session vypršela.' },
    'register': { en: 'Register', cs: 'Registrovat' },
    'logout': { en: 'Logout', cs: 'Odhlásit se' },
    'welcome': { en: 'Welcome', cs: 'Vítejte' },
    'sportsOrganizer': { en: 'Orgie', cs: 'Orgie' },
    'email': { en: 'Email', cs: 'E-mail' },
    'password': { en: 'Password', cs: 'Heslo' },
    'passwordLabel': { en: 'Password', cs: 'Heslo' },
    'firstName': { en: 'First Name', cs: 'Jméno' },
    'lastName': { en: 'Last Name', cs: 'Příjmení' },
    'dontHaveAccount': { en: "Don't have an account?", cs: 'Nemáte účet?' },
    'alreadyHaveAccount': { en: 'Already have an account?', cs: 'Již máte účet?' },

    // Dashboard / Event Form
    'dashboardTitle': { en: 'Dashboard', cs: 'Přehled' },
    'managedEvents': { en: 'Managed Events', cs: 'Mnou spravované události' },
    'attendingEvents': { en: 'Attending Events', cs: 'Události, u kterých jsem evidován' },
    'noManagedEvents': { en: 'You are not managing any events yet.', cs: 'Zatím nespravujete žádné události.' },
    'noAttendingEvents': { en: 'You have not joined any events yet.', cs: 'Zatím nejste přihlášeni k žádné události.' },
    'termFull': { en: 'Term is full', cs: 'Termín je plný' },
    'profile': { en: 'Profile', cs: 'Profil' },
    'confirmPassword': { en: 'Confirm Password', cs: 'Potvrzení hesla' },
    'passwordsDoNotMatch': { en: 'Passwords do not match', cs: 'Hesla se neshodují' },
    'profileUpdated': { en: 'Profile updated successfully', cs: 'Profil byl úspěšně aktualizován' },
    'updateProfile': { en: 'Update Profile', cs: 'Aktualizovat profil' },
    'newPasswordLabel': { en: 'New Password (leave blank to keep current)', cs: 'Nové heslo (nechte prázdné pro zachování stávajícího)' },
    'confirmNewPasswordLabel': { en: 'Confirm New Password', cs: 'Potvrzení nového hesla' },
    'createNewEvent': { en: 'Create New Event', cs: 'Vytvořit Novou Událost' },
    'name': { en: 'Name', cs: 'Název' },
    'participantName': { en: 'Name', cs: 'Jméno' },
    'place': { en: 'Place', cs: 'Místo' },
    'description': { en: 'Description', cs: 'Popis' },
    'type': { en: 'Type', cs: 'Typ' },
    'oneTime': { en: 'One Time', cs: 'Jednorázová' },
    'recurring': { en: 'Recurring', cs: 'Opakovaná' },
    'time': { en: 'Time', cs: 'Čas' },
    'startTime': { en: 'Start Time', cs: 'Čas Začátku' },
    'endTime': { en: 'End Time', cs: 'Čas Konce' },
    'date': { en: 'Date', cs: 'Datum' },
    'frequency': { en: 'Frequency', cs: 'Frekvence' },
    'daily': { en: 'Daily', cs: 'Denně' },
    'weekly': { en: 'Weekly', cs: 'Týdně' },
    'monthly': { en: 'Monthly', cs: 'Měsíčně' },
    'daysOfWeek': { en: 'Days of Week', cs: 'Dny v týdnu' },
    'daysOfMonth': { en: 'Days of Month', cs: 'Dny v měsíci' },
    'daysOfMonthPlaceholder': { en: '1, 15, 30', cs: '1, 15, 30' },
    'createEventBtn': { en: 'Create Event', cs: 'Vytvořit Událost' },
    'updateEventBtn': { en: 'Update Event', cs: 'Upravit Událost' },
    'editEvent': { en: 'Edit Event', cs: 'Upravit Událost' },
    'edit': { en: 'Edit', cs: 'Upravit' },
    'allEvents': { en: 'All Events', cs: 'Všechny Události' },
    'archivedTerms': { en: 'Archived Terms', cs: 'Archivní termíny' },
    'deleteArchivedBtn': { en: 'Delete from Archive', cs: 'Mazat z archivu' },
    'bulkDeleteTitle': { en: 'Bulk Delete Archived Terms', cs: 'Hromadné smazání archivních termínů' },
    'deleteFrom': { en: 'Delete from', cs: 'Smazat od' },
    'deleteTo': { en: 'Delete to', cs: 'Smazat do' },
    'bulkDeleteConfirm': { en: 'Are you sure you want to delete all terms in this range? This action cannot be undone.', cs: 'Opravdu chcete smazat všechny termíny v tomto rozmezí? Tuto akci nelze vrátit.' },
    'endDateError': { en: 'End date must be in the past', cs: 'Koncové datum musí být v minulosti' },
    'showArchive': { en: 'Show Archive', cs: 'Zobrazit archiv' },
    'hideArchive': { en: 'Hide Archive', cs: 'Skrýt archiv' },
    'noArchivedTerms': { en: 'No archived terms found.', cs: 'Žádné archivní termíny nebyly nalezeny.' },
    'loadingArchive': { en: 'Loading archive...', cs: 'Načítám archiv...' },
    'owner': { en: 'Owner', cs: 'Vlastník' },
    'unknown': { en: 'Unknown', cs: 'Neznámý' },
    'back': { en: 'Back', cs: 'Zpět' },
    'eventDetails': { en: 'Event Details', cs: 'Detaily Události' },
    'terms': { en: 'Terms', cs: 'Termíny' },
    'generateTerms': { en: 'Generate Terms', cs: 'Generovat Termíny' },
    'noTerms': { en: 'No terms scheduled yet', cs: 'Zatím nejsou naplánovány žádné termíny' },
    'attendees': { en: 'Attendees', cs: 'Účastníci' },
    'administrators': { en: 'Administrators', cs: 'Administrátoři' },
    'viewDetail': { en: 'View Detail', cs: 'Zobrazit Detail' },
    'startDate': { en: 'Start Date', cs: 'Datum Od' },
    'endDate': { en: 'End Date', cs: 'Datum Do' },
    'generate': { en: 'Generate', cs: 'Generovat' },
    'termsGenerated': { en: 'Terms generated successfully!', cs: 'Termíny úspěšně vygenerovány!' },
    'eventUpdated': { en: 'Event updated successfully!', cs: 'Událost úspěšně aktualizována!' },
    'termDeleted': { en: 'Term deleted successfully', cs: 'Termín úspěšně smazán' },
    'confirmDeleteTerm': { en: 'Are you sure you want to delete this term?', cs: 'Opravdu chcete smazat tento termín?' },
    'viewCards': { en: 'Card View', cs: 'Kartičky' },
    'viewMatrix': { en: 'Attendance Matrix', cs: 'Přihlašovací Matice' },
    'addMeToMatrix': { en: 'Add Me', cs: 'Přidat sebe' },
    'noAttendees': { en: 'No one has signed up yet. Be the first!', cs: 'Zatím se nikdo nepřihlásil. Buďte první!' },
    'you': { en: '(You)', cs: '(Vy)' },
    'toggleAttendance': { en: 'Toggle attendance', cs: 'Přepnout účast' },
    'attendanceUpdated': { en: 'Attendance updated', cs: 'Účast aktualizována' },
    'noFutureTerms': { en: 'No upcoming terms scheduled', cs: 'Žádné nadcházející termíny' },
    'close': { en: 'Close', cs: 'Zavřít' },
    'signUp': { en: 'Sign Up', cs: 'Přihlásit se' },
    'leave': { en: 'Leave', cs: 'Odhlásit se' },
    'showing': { en: 'Showing', cs: 'Zobrazeno' },
    'showingFirstTerms': { en: 'Showing first', cs: 'Zobrazeno prvních' },
    'of': { en: 'of', cs: 'z' },
    'upcomingTerms': { en: 'upcoming terms', cs: 'nadcházejících termínů' },
    'pastTerms': { en: 'past terms', cs: 'proběhlých termínů' },
    'loadMore': { en: 'Load More', cs: 'Načíst další' },
    'remaining': { en: 'remaining', cs: 'zbývá' },
    'previous': { en: 'Previous', cs: 'Předchozí' },
    'next': { en: 'Next', cs: 'Další' },
    'capacity': { en: 'Capacity', cs: 'Kapacita' },
    'min': { en: 'Min', cs: 'Min' },
    'max': { en: 'Max', cs: 'Max' },
    'minAttendees': { en: 'Min. Attendees', cs: 'Min. účastníků' },
    'maxAttendees': { en: 'Max. Attendees', cs: 'Max. účastníků' },
    'loading': { en: 'Loading...', cs: 'Načítání...' },
    'nickname': { en: 'Nickname', cs: 'Přezdívka' },
    'preferNicknameLabel': { en: 'Use nickname instead of full name in the app', cs: 'Používat v aplikaci přezdívku místo celého jména' },
    'confirmRemoveAttendee': { en: 'Remove Attendee', cs: 'Odebrat Účastníka' },
    'confirmRemoveAttendeeMsg': { en: 'Are you sure you want to remove this person from the entire event and all terms?', cs: 'Opravdu chcete tuto osobu odebrat z celé události a všech jejích termínů?' },
    'attendeeRemoved': { en: 'Attendee removed successfully', cs: 'Účastník byl úspěšně odebrán' },
    'removeAttendee': { en: 'Remove Attendee', cs: 'Odebrat účastníka' },

    // Modal
    'deleteEventTitle': { en: 'Delete Event', cs: 'Smazat Událost' },
    'deleteEventConfirm': { en: 'Are you sure you want to delete this event? This action cannot be undone.', cs: 'Opravdu chcete smazat tuto událost? Tuto akci nelze vrátit zpět.' },
    'delete': { en: 'Delete', cs: 'Smazat' },
    'cancel': { en: 'Cancel', cs: 'Zrušit' },
    'remove': { en: 'Remove', cs: 'Odebrat' },
    'search_for_administrators': { en: 'Search for administrators...', cs: 'Vyhledat administrátory...' },

    // Days Short
    'Sun': { en: 'Sun', cs: 'Ne' },
    'Mon': { en: 'Mon', cs: 'Po' },
    'Tue': { en: 'Tue', cs: 'Út' },
    'Wed': { en: 'Wed', cs: 'St' },
    'Thu': { en: 'Thu', cs: 'Čt' },
    'Fri': { en: 'Fri', cs: 'Pá' },
    'Sat': { en: 'Sat', cs: 'So' },
    'activityType': { en: 'Activity Type', cs: 'Typ Aktivity' },
    'teamSport': { en: 'Team Sport', cs: 'Týmový Sport' },
    'none': { en: 'None', cs: 'Žádný' },
    'statistics': { en: 'Statistics', cs: 'Statistiky' },
    'numTeams': { en: 'Number of Teams', cs: 'Počet Týmů' },
    'assignTeams': { en: 'Assign Participants to Teams', cs: 'Přiřadit Účastníky do Týmů' },
    'team': { en: 'Team', cs: 'Tým' },
    'wins': { en: 'Wins', cs: 'Výhry' },
    'draws': { en: 'Draws', cs: 'Remízy' },
    'losses': { en: 'Losses', cs: 'Prohry' },
    'saveStatistics': { en: 'Save Statistics', cs: 'Uložit Statistiky' },
    'participantDistribution': { en: 'Participant Distribution', cs: 'Rozdělení Účastníků' },
    'participants': { en: 'Participants', cs: 'Účastníci' },
    'attendanceCount': { en: 'Attendance', cs: 'Účast' },
    'attendancePercentage': { en: 'Attendance %', cs: 'Účast %' },
    'winPercentage': { en: 'Win %', cs: 'Výhry %' },
    'lossPercentage': { en: 'Loss %', cs: 'Prohry %' },
    'showStats': { en: 'Show Statistics', cs: 'Zobrazit statistiky' },
    'hideStats': { en: 'Hide Statistics', cs: 'Skrýt statistiky' },
    'statsTooltip': { en: 'Statistics are filled for {filled} out of {total} terms', cs: 'Jsou vyplněny statistiky pro {filled} z {total} termínů' },
    'addGuest': { en: 'Add Guest', cs: 'Přidat hosta' },
    'guest': { en: 'Guest', cs: 'Host' },
    'addedBy': { en: 'Added by', cs: 'Přidal' },
    'guestAdded': { en: 'Guest added successfully', cs: 'Host byl úspěšně přidán' },
    'unknownUser': { en: 'Unknown User', cs: 'Neznámý uživatel' },
    'deletedGuest': { en: 'Deleted Guest', cs: 'Smazaný host' },
    'termOutcomePreview': { en: 'Term Outcome Preview', cs: 'Předběžný výsledek termínu' },
    'noStatsEntered': { en: 'Enter stats to see the outcome', cs: 'Zadejte výsledky pro zobrazení výsledku' },
    'outcomeWin': { en: 'WIN', cs: 'VÝHRA' },
    'outcomeDraw': { en: 'DRAW', cs: 'REMÍZA' },
    'outcomeLoss': { en: 'LOSS', cs: 'PROHRA' },
    'season': { en: 'Season', cs: 'Sezóna' },
    'seasons': { en: 'Seasons', cs: 'Sezóny' },
    'seasonName': { en: 'Season Name', cs: 'Název sezóny' },
    'addSeason': { en: 'Add Season', cs: 'Přidat sezónu' },
    'currentSeason': { en: 'Current Season', cs: 'Aktuální sezóna' },
    'allSeasons': { en: 'All Seasons', cs: 'Všechny sezóny' },
    'noSeasons': { en: 'No seasons defined', cs: 'Žádné sezóny nejsou definovány' },
    'overlapError': { en: 'Seasons cannot overlap', cs: 'Sezóny se nemohou překrývat' },
    'invalidDateError': { en: 'Start date must be before end date', cs: 'Počáteční datum musí být před koncovým' },
    'forgotPassword': { en: 'Forgot password?', cs: 'Zapomněl jsi heslo?' },
    'forgotPasswordTitle': { en: 'Find Your Account', cs: 'Najděte svůj účet' },
    'forgotPasswordInstruction': { en: 'Please enter your email search for your account.', cs: 'Zadejte svůj e-mail pro vyhledání účtu.' },
    'sendResetLink': { en: 'Send Reset Link', cs: 'Odeslat odkaz pro obnovu' },
    'resetPasswordTitle': { en: 'Reset Password', cs: 'Obnovit heslo' },
    'newPassword': { en: 'New Password', cs: 'Nové heslo' },
    'confirmNewPassword': { en: 'Confirm New Password', cs: 'Potvrzení nového hesla' },
    'saveNewPassword': { en: 'Save New Password', cs: 'Uložit nové heslo' },
    'checkEmailMsg': { en: 'If an account with this email exists, a reset link has been sent.', cs: 'Pokud existuje účet s tímto e-mailem, byl na něj odeslán odkaz pro obnovu hesla.' },
    'passwordResetSuccess': { en: 'Password reset successful. You can now login.', cs: 'Heslo bylo úspěšně změněno. Nyní se můžete přihlásit.' },

    // Poll feature
    'polls': { en: 'Polls', cs: 'Hlasování' },
    'events': { en: 'Events', cs: 'Události' },
    'newPoll': { en: 'New Poll', cs: 'Nové hlasování' },
    'pollTitle': { en: 'Poll title', cs: 'Název hlasování' },
    'pollDescription': { en: 'Description (optional)', cs: 'Popis (volitelný)' },
    'pollProposedDates': { en: 'Proposed dates', cs: 'Navržené termíny' },
    'pollDeadline': { en: 'Deadline (optional)', cs: 'Uzávěrka (volitelná)' },
    'pollAddDate': { en: '+ Add date', cs: '+ Přidat termín' },
    'pollCreateBtn': { en: 'Create poll', cs: 'Vytvořit hlasování' },
    'pollOpen': { en: 'Open', cs: 'Otevřeno' },
    'pollClosed': { en: 'Closed', cs: 'Uzavřeno' },
    'pollResponses': { en: 'responses', cs: 'hlasů' },
    'pollVoterName': { en: 'Your name', cs: 'Tvoje jméno' },
    'pollSaveVotes': { en: 'Save votes', cs: 'Uložit hlasy' },
    'pollClose': { en: 'Close poll', cs: 'Uzavřít hlasování' },
    'pollWinner': { en: 'Winning date', cs: 'Vítězný termín' },
    'pollCreateEvent': { en: 'Create event from this date', cs: 'Vytvořit event z tohoto termínu' },
    'pollPlace': { en: 'Place', cs: 'Místo' },
    'pollEndTime': { en: 'End time', cs: 'Čas konce' },
    'pollConfirmBtn': { en: 'Confirm and create event', cs: 'Potvrdit a vytvořit event' },
    'pollEventCreated': { en: 'Event created', cs: 'Event vytvořen' },
    'pollViewEvent': { en: 'View event', cs: 'Zobrazit event' },
    'pollCopyLink': { en: 'Copy link', cs: 'Kopírovat odkaz' },
    'pollLinkCopied': { en: 'Link copied!', cs: 'Odkaz zkopírován!' },
    'pollNoPolls': { en: 'You have no polls yet.', cs: 'Zatím nemáte žádná hlasování.' },
    'pollClosedVoting': { en: 'This poll is closed. Voting is no longer available.', cs: 'Toto hlasování je uzavřeno. Hlasování již není možné.' },
    'pollAtLeastTwoDates': { en: 'Add at least 2 dates', cs: 'Přidejte alespoň 2 termíny' },
    'pollTypeLabel':         { en: 'Poll type',             cs: 'Typ hlasování' },
    'pollTypeDate':          { en: 'Finding a date',        cs: 'Hledání termínu' },
    'pollTypeText':          { en: 'Something else',        cs: 'Něco jiného' },
    'pollAddOption':         { en: '+ Add option',          cs: '+ Přidat možnost' },
    'pollProposedOptions':   { en: 'Options',               cs: 'Možnosti' },
    'pollOptionPlaceholder': { en: 'Option text',           cs: 'Text možnosti' },
    'pollAtLeastTwoOptions': { en: 'Enter at least 2 options', cs: 'Zadejte alespoň 2 možnosti' },
    'pollWinnerOption':      { en: 'Winning option',        cs: 'Vítězná možnost' },
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>('cs'); // Default to CS as per user implicitness, or stick to EN? User asked to add CS and EN, let's default to CS as it seems to be the native lang request.

    const t = (key: string): string => {
        if (!translations[key]) {
            console.warn(`Translation missing for key: ${key}`);
            return key;
        }
        return translations[key][language];
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
