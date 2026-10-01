export function getOrganicGreeting(date = new Date()): { greeting: string; shift: string; shiftName: string } {
  const hours = date.getHours();
  let greeting = 'Selamat Pagi';
  if (hours >= 11 && hours < 15) greeting = 'Selamat Siang';
  else if (hours >= 15 && hours < 19) greeting = 'Selamat Sore';
  else if (hours >= 19 || hours < 4) greeting = 'Selamat Malam';

  let shift = '1';
  let shiftName = 'Shift 1 (Pagi)';
  if (hours >= 15 && hours < 23) {
    shift = '2';
    shiftName = 'Shift 2 (Sore)';
  } else if (hours >= 23 || hours < 7) {
    shift = '3';
    shiftName = 'Shift 3 (Malam)';
  }

  return { greeting, shift, shiftName };
}
