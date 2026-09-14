export function combineDateAndTime(date: string, time: string) {
  const [y,m,d] = date.split('-').map(Number)
  const [hh,mm] = time.split(':').map(Number)
  return new Date(y,m-1,d,hh,mm,0,0)
}
