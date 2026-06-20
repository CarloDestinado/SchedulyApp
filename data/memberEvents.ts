import { ScheduleEvent } from '@/context/AuthContext';

const today = new Date();
const fmt = (d: Date) => d.toISOString().split('T')[0];
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const MEMBER_EVENTS: Record<string, ScheduleEvent[]> = {
  Alice: [
    { id: 'a1', title: 'Alice Standup',    date: fmt(today),             startTime: '09:00', endTime: '09:30' },
    { id: 'a2', title: 'Alice Design Rev', date: fmt(addDays(today, 1)), startTime: '14:00', endTime: '15:30' },
    { id: 'a3', title: 'Alice Lunch',      date: fmt(addDays(today, 2)), startTime: '12:00', endTime: '13:00' },
    { id: 'a4', title: 'Alice Workshop',   date: fmt(addDays(today, 3)), startTime: '10:00', endTime: '12:00' },
  ],
  Bob: [
    { id: 'b1', title: 'Bob Client Call',  date: fmt(today),             startTime: '11:00', endTime: '12:00' },
    { id: 'b2', title: 'Bob Planning',     date: fmt(addDays(today, 1)), startTime: '09:00', endTime: '10:30' },
    { id: 'b3', title: 'Bob Review',       date: fmt(addDays(today, 2)), startTime: '15:00', endTime: '16:00' },
    { id: 'b4', title: 'Bob Training',     date: fmt(addDays(today, 4)), startTime: '13:00', endTime: '14:00' },
  ],
  Carol: [
    { id: 'c1', title: 'Carol Sync',       date: fmt(today),             startTime: '10:00', endTime: '11:00' },
    { id: 'c2', title: 'Carol Interview',  date: fmt(addDays(today, 1)), startTime: '13:00', endTime: '14:00' },
    { id: 'c3', title: 'Carol Sprint',     date: fmt(addDays(today, 3)), startTime: '09:00', endTime: '10:00' },
    { id: 'c4', title: 'Carol Demo',       date: fmt(addDays(today, 4)), startTime: '15:00', endTime: '16:30' },
  ],
  Dan: [
    { id: 'd1', title: 'Dan Standup',      date: fmt(today),             startTime: '09:00', endTime: '09:30' },
    { id: 'd2', title: 'Dan Retro',        date: fmt(addDays(today, 2)), startTime: '14:00', endTime: '15:00' },
    { id: 'd3', title: 'Dan 1:1',          date: fmt(addDays(today, 3)), startTime: '11:00', endTime: '12:00' },
  ],
  Eve: [
    { id: 'e1', title: 'Eve Workshop',     date: fmt(today),             startTime: '13:00', endTime: '15:00' },
    { id: 'e2', title: 'Eve Planning',     date: fmt(addDays(today, 1)), startTime: '10:00', endTime: '11:00' },
    { id: 'e3', title: 'Eve Review',       date: fmt(addDays(today, 4)), startTime: '09:00', endTime: '10:00' },
  ],
  Frank: [
    { id: 'f1', title: 'Frank Standup',    date: fmt(today),             startTime: '09:00', endTime: '09:30' },
    { id: 'f2', title: 'Frank Client',     date: fmt(addDays(today, 2)), startTime: '11:00', endTime: '13:00' },
    { id: 'f3', title: 'Frank Training',   date: fmt(addDays(today, 3)), startTime: '14:00', endTime: '16:00' },
  ],
  Mom: [
    { id: 'm1', title: 'Mom Appointment',  date: fmt(addDays(today, 1)), startTime: '10:00', endTime: '11:00' },
    { id: 'm2', title: 'Mom Errands',      date: fmt(addDays(today, 3)), startTime: '09:00', endTime: '11:00' },
  ],
  Dad: [
    { id: 'p1', title: 'Dad Meeting',      date: fmt(today),             startTime: '14:00', endTime: '15:00' },
    { id: 'p2', title: 'Dad Golf',         date: fmt(addDays(today, 2)), startTime: '08:00', endTime: '12:00' },
  ],
  Sister: [
    { id: 'si1', title: 'Sister Class',    date: fmt(addDays(today, 1)), startTime: '09:00', endTime: '11:00' },
    { id: 'si2', title: 'Sister Gym',      date: fmt(addDays(today, 4)), startTime: '07:00', endTime: '08:00' },
  ],
  Jake: [
    { id: 'j1', title: 'Jake Study',       date: fmt(today),             startTime: '10:00', endTime: '12:00' },
    { id: 'j2', title: 'Jake Lecture',     date: fmt(addDays(today, 2)), startTime: '13:00', endTime: '15:00' },
  ],
  Mia: [
    { id: 'mi1', title: 'Mia Lab',         date: fmt(addDays(today, 1)), startTime: '09:00', endTime: '12:00' },
    { id: 'mi2', title: 'Mia Tutoring',    date: fmt(addDays(today, 3)), startTime: '15:00', endTime: '17:00' },
  ],
};
