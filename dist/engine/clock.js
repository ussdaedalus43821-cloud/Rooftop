import { DAY_MS_AT_1X } from "../constants.js";
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const START_YEAR = 1;
const START_MONTH = 3; // April, 0-indexed
export function msPerGameDay(speed) {
    if (speed === 0)
        return Infinity;
    return DAY_MS_AT_1X / speed;
}
export function toCalendarDate(day) {
    let year = START_YEAR;
    let month = START_MONTH;
    let remaining = day;
    for (;;) {
        const dim = daysInMonth(year, month);
        if (remaining < dim)
            break;
        remaining -= dim;
        month += 1;
        if (month > 11) {
            month = 0;
            year += 1;
        }
    }
    return { year, month, dayOfMonth: remaining + 1, isFirstOfMonth: remaining === 0 };
}
function daysInMonth(year, month) {
    if (month === 1 && isLeap(year))
        return 29;
    return DAYS_IN_MONTH[month];
}
function isLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
export function formatDate(day) {
    const d = toCalendarDate(day);
    return `${MONTH_NAMES[d.month]} ${d.dayOfMonth}, Year ${d.year}`;
}
export function monthLabel(day) {
    const d = toCalendarDate(day);
    return `${MONTH_NAMES[d.month]} Year ${d.year}`;
}
export function isNewMonth(day) {
    return toCalendarDate(day).isFirstOfMonth;
}
//# sourceMappingURL=clock.js.map