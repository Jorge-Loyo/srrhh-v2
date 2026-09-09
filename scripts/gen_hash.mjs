import bcrypt from 'bcryptjs'
const hash = await bcrypt.hash('Test1234!', 12)
console.log(hash)
