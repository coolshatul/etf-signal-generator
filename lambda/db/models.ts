import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscriber extends Document {
    chatId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    isActive: boolean;
    subscribedAt: Date;
    unsubscribedAt?: Date;
}

const SubscriberSchema: Schema = new Schema({
    chatId: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    username: {
        type: String,
        sparse: true
    },
    firstName: {
        type: String
    },
    lastName: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    subscribedAt: {
        type: Date,
        default: Date.now
    },
    unsubscribedAt: {
        type: Date
    }
});

export const Subscriber = mongoose.model<ISubscriber>('Subscriber', SubscriberSchema);

export interface ISignal extends Document {
    symbol: string;
    date: Date;
    signal: 'BUY' | 'SELL' | 'HOLD';
    price: number;
    rating: number;
    signals: string[];
    stopLoss: number;
    target: number;
    riskRewardRatio: number;
    strategy: string;
    metadata?: any;
    createdAt: Date;
}

const SignalSchema: Schema = new Schema({
    symbol: {
        type: String,
        required: true,
        index: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    signal: {
        type: String,
        enum: ['BUY', 'SELL', 'HOLD'],
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    rating: {
        type: Number,
        default: 0
    },
    signals: [{
        type: String
    }],
    stopLoss: {
        type: Number
    },
    target: {
        type: Number
    },
    riskRewardRatio: {
        type: Number
    },
    strategy: {
        type: String,
        required: true,
        index: true
    },
    metadata: {
        type: Schema.Types.Mixed
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index for uniqueness: one signal per symbol per date per strategy
SignalSchema.index({ symbol: 1, date: 1, strategy: 1 }, { unique: true });

export const Signal = mongoose.model<ISignal>('Signal', SignalSchema);
