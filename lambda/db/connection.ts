import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
}

let isConnected = false;

export async function connectToDatabase(): Promise<void> {
    if (isConnected) {
        console.log('MongoDB already connected');
        return;
    }

    try {
        await mongoose.connect(MONGODB_URI, {
            // Modern mongoose doesn't need these options, but keeping for compatibility
            // useNewUrlParser: true,
            // useUnifiedTopology: true,
        });

        isConnected = true;
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        throw error;
    }
}

export async function disconnectFromDatabase(): Promise<void> {
    if (isConnected) {
        await mongoose.disconnect();
        isConnected = false;
        console.log('✅ MongoDB disconnected');
    }
}

// Handle connection events
mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error);
    isConnected = false;
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
    isConnected = false;
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
    isConnected = true;
});
