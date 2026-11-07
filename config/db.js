const mongoose = require('mongoose');

let connectionPromise = null;

const sanitizeError = (error) => {
    const message = error && error.message ? error.message : String(error);
    const url = process.env.MONGO_URL;
    const redacted = url ? message.split(url).join('[redacted]') : message;
    return redacted.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[redacted]');
};

const connectDB = async ()=>{
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (!connectionPromise) {
        if (!process.env.MONGO_URL) {
            console.error("MongoDB connection failed: MONGO_URL is not configured");
            throw new Error("MONGO_URL is not configured");
        }

        connectionPromise = Promise.resolve()
            .then(() => mongoose.connect(process.env.MONGO_URL))
            .then((connection) => {
                console.log("MongoDB connected successfully");
                return connection;
            })
            .catch((error) => {
                connectionPromise = null;
                console.error(`MongoDB connection failed: ${sanitizeError(error)}`);
                throw error;
            });
    }

    return connectionPromise;
}

module.exports= connectDB;
