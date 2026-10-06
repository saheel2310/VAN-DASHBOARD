export const METRIC_COLUMNS = [
  { key: 'totalParties',    label: 'Total Parties' },
  { key: 'usingVAN',        label: 'Using VAN',                tone: 'positive' },
  { key: 'notUsingVAN',     label: 'Not Using VAN',            tone: 'negative' },
  { key: 'usingVANCredit',  label: 'Using VAN - Credit' },
  { key: 'usingVANAdvance', label: 'Using VAN - 100% Advance' },
  { key: 'usingVANOther',   label: 'Using VAN - Other',        optional: true },
  { key: 'invalidMissing',  label: 'Invalid / Missing',        optional: true, tone: 'warning' },
  { key: 'newVANUsers',     label: 'New VAN Users' },
];

export const NEW_USERS_RULE =
  'New VAN users: parties using VAN for the first time. A party that stops and starts again is new only the first time; VAN users in the starting month are existing users.';

export const METRIC_LABELS = Object.fromEntries(METRIC_COLUMNS.map(c => [c.key, c.label]));

export const STATUS_BADGES = {
  NOT_USING:       { label: 'Not Using VAN',            className: 'red' },
  USING_CREDIT:    { label: 'Using VAN - Credit',       className: 'green' },
  USING_ADVANCE:   { label: 'Using VAN - 100% Advance', className: 'green' },
  USING_OTHER:     { label: 'Using VAN - Other',        className: 'green' },
  INVALID_MISSING: { label: 'Invalid / Missing',        className: 'amber' },
};

export const NO_DATA_MESSAGES = {
  year:  'No data available for this year.',
  month: 'No data available for this month.',
};

export const ALL_MONTHS_RULE =
  'All Months counts each party once: Using VAN if it used VAN in any month, Not Using if "No" in every month.';
