import { parseDate, type CalendarDate } from "@internationalized/date";
import {
  Button as AriaButton, Calendar, CalendarCell, CalendarGrid, CalendarGridBody, CalendarGridHeader, CalendarHeaderCell, DateInput, DatePicker as AriaDatePicker,
  DateSegment, Dialog, Group, Heading, Label, Popover, Text,
} from "react-aria-components";
import { Icon } from "../Icon/Icon.tsx";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";
import * as s from "./DatePicker.css.ts";

export interface DatePickerProps {
  label: string;
  /** The day picked, `YYYY-MM-DD`, or "" for none. */
  value?: string;
  /** The first day that can be picked, `YYYY-MM-DD`. */
  min?: string;
  description?: string;
  invalid?: boolean;
  id?: string;
  onChange?: (payload: { value: string }) => void;
}

const day = (v: string | undefined): CalendarDate | null => {
  if (!v) return null;
  try { return parseDate(v); } catch { return null; }
};

/**
 * A day, typed segment by segment or picked on a calendar (D-143): React Aria's date picker, so every
 * part works from the keyboard (arrows change a segment, Alt+Down opens the calendar) and is named
 * in the locale's words.
 */
export function DatePicker({ label, value, min, description, invalid, id, onChange }: DatePickerProps) {
  const boundary = useWindowBoundary();
  const minValue = day(min);
  return (
    <AriaDatePicker
      className={s.root}
      value={day(value)}
      {...(minValue ? { minValue } : {})}
      isInvalid={Boolean(invalid)}
      granularity="day"
      onChange={(v) => onChange?.({ value: v ? v.toString() : "" })}
      {...(id ? { id } : {})}
    >
      <Label className={s.label}>{label}</Label>
      <Group className={s.group}>
        <DateInput className={s.input}>{(segment) => <DateSegment segment={segment} className={s.segment} />}</DateInput>
        <AriaButton className={s.button}><Icon name="calendar" /></AriaButton>
      </Group>
      {description ? <Text slot="description" className={s.description}>{description}</Text> : null}
      <Popover className={s.popover} placement="bottom end" {...boundary} data-floating-child="" data-surface="popover">
        <Dialog className={s.dialog}>
          <Calendar className={s.calendar}>
            <header className={s.header}>
              <AriaButton slot="previous" className={s.button}><Icon name="chevronLeft" /></AriaButton>
              <Heading className={s.heading} />
              <AriaButton slot="next" className={s.button}><Icon name="chevronRight" /></AriaButton>
            </header>
            <CalendarGrid className={s.grid}>
              <CalendarGridHeader>{(d) => <CalendarHeaderCell className={s.weekday}>{d}</CalendarHeaderCell>}</CalendarGridHeader>
              <CalendarGridBody>{(date) => <CalendarCell date={date} className={s.cell} />}</CalendarGridBody>
            </CalendarGrid>
          </Calendar>
        </Dialog>
      </Popover>
    </AriaDatePicker>
  );
}
