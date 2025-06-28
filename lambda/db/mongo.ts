import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { StrategyResult } from '../types';

dotenv.config();

const mongoUri = process.env.MONGO_URI!;

const signalSchema = new mongoose.Schema({
    symbol: String,
    date: String,
    price: Number,
    rsi: Number,
    emaFast: Number,
    emaSlow: Number,
    signal: String,
    reason: String,
}, { timestamps: true });

const SignalModel = mongoose.models.Signal || mongoose.model('Signal', signalSchema);

let isConnected = false;

export async function logToMongo(result: StrategyResult): Promise<void> {
    if (!isConnected) {
        await mongoose.connect(mongoUri);
        isConnected = true;
    }

    const doc = new SignalModel(result);
    await doc.save();
    console.log(`🗃️ Logged signal for ${result.symbol} to MongoDB`);
}
