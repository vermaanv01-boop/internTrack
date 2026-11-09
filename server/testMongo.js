const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: 'server/.env' });

console.log('Testing MongoDB connection...');
mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('MongoDB CONNECTED successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('MongoDB Connection Error:', err.message);
    process.exit(1);
  });
