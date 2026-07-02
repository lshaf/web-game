// Indonesian word puzzles for Solo Lock (kata bahasa Indonesia).
// Each puzzle is [clue, answer]; answers are A–Z only, 2–11 letters.
//
// Attempts are DERIVED from the answer length, not hand-set: longer words get
// more guesses, with 6 as the floor.
export const attemptsFor = (answer) => Math.max(6, answer.length + 1)

const raw = [
  // 4
  ['Selimut langit', 'AWAN'],
  ['Putih mengepul', 'NASI'],
  ['Teman selai', 'ROTI'],
  ['Penghuni akuarium', 'IKAN'],
  ['Jendela jiwa', 'MATA'],
  ['Hadiah sapi', 'SUSU'],
  ['Emas lebah', 'MADU'],
  ['Gudang kata', 'BUKU'],
  ['Godaan Newton', 'APEL'],
  // 5
  ['Lampu malam', 'BULAN'],
  ['Tetesan langit', 'HUJAN'],
  ['Tempat pulang', 'RUMAH'],
  ['Penghuni garasi', 'MOBIL'],
  ['Pengarung samudra', 'KAPAL'],
  ['Mulut ruangan', 'PINTU'],
  ['Singgasana harian', 'KURSI'],
  ['Perhiasan taman', 'BUNGA'],
  ['Loreng buas', 'MACAN'],
  ['Penunggu sungai', 'BUAYA'],
  ['Raksasa berbelalai', 'GAJAH'],
  // 6
  ['Musuh tikus', 'KUCING'],
  ['Kesukaan monyet', 'PISANG'],
  ['Nadi lembah', 'SUNGAI'],
  ['Rumah awan', 'GUNUNG'],
  ['Dikayuh kaki', 'SEPEDA'],
  ['Perisai hujan', 'PAYUNG'],
  ['Sarang uang', 'DOMPET'],
  ['Pasangan garpu', 'SENDOK'],
  // 7
  ['Loreng Sumatra', 'HARIMAU'],
  ['Pelahap wortel', 'KELINCI'],
  ['Tujuh warna', 'PELANGI'],
  ['Sarang ilmu', 'SEKOLAH'],
  ['Kelip malam', 'BINTANG'],
  ['Leher menara', 'JERAPAH'],
  // 8
  ['Raja siang', 'MATAHARI'],
  ['Otak elektronik', 'KOMPUTER'],
  ['Buah piknik', 'SEMANGKA'],
  // 9
  ['Ayunan laut', 'GELOMBANG'],
  ['Si kulit bundar', 'SEPAKBOLA'],
  // 10
  ['Capung besi', 'HELIKOPTER'],
  // 11
  ['Hadiah Agustus', 'KEMERDEKAAN'],
]

export const puzzles = raw.map(([clue, answer]) => {
  const a = answer.toUpperCase().replace(/[^A-Z]/g, '')
  return { clue, answer: a, attempts: attemptsFor(a) }
})
