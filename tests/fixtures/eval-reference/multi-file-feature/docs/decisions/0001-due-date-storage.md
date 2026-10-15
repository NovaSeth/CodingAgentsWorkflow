# 0001: Due dates are stored as ISO date strings

Status: accepted

Tasks keep `due` as a `YYYY-MM-DD` string (or `null`), not as a `Date`. A calendar date has no time or zone,
and the string sorts and compares correctly as text, so "overdue" is a string comparison against today's date.
