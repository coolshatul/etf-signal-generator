import mongoose, { Schema, Document } from 'mongoose';
import {
    ExitReason,
    SignalDirection,
    SignalStatus,
    SignalSubtype,
    SignalTimeframe,
} from '../types';

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
    /** Immutable idempotency key: strategy|timeframe|symbol|direction|eventAt */
    signalKey: string;
    symbol: string;
    date: Date;
    /** Exact candle timestamp used for entry. */
    entryAt: Date;
    timeframe: SignalTimeframe;
    /** Crossover only: bar where EMA9/15 actually crossed. */
    crossedAt?: Date;
    signal: SignalDirection;
    subtype?: SignalSubtype;
    price: number;
    lastPrice?: number;
    /** Net performance (kept for backward compatibility). */
    performancePercent?: number;
    grossPerformancePercent?: number;
    netPerformancePercent?: number;
    adjustedEntryPrice?: number;
    exitPrice?: number;
    exitDate?: Date;
    exitReason?: ExitReason;
    holdingDays?: number;
    status: SignalStatus;
    rating: number;
    signals: string[];
    stopLoss: number;
    target: number;
    riskRewardRatio: number;
    strategy: string;
    metadata?: any;
    lastUpdatedAt?: Date;
    createdAt: Date;
}

const SignalSchema: Schema = new Schema({
    signalKey: {
        type: String,
        required: true
    },
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
    entryAt: {
        type: Date
    },
    timeframe: {
        type: String,
        enum: ['15m', '1h', '1d', '1wk'],
        default: '1d',
        index: true
    },
    crossedAt: {
        type: Date
    },
    subtype: {
        type: String,
        enum: ['BREAKOUT', 'PULLBACK', 'CROSSOVER', 'WATCHLIST']
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
    lastPrice: {
        type: Number
    },
    performancePercent: {
        type: Number
    },
    grossPerformancePercent: {
        type: Number
    },
    netPerformancePercent: {
        type: Number
    },
    adjustedEntryPrice: {
        type: Number
    },
    exitPrice: {
        type: Number
    },
    exitDate: {
        type: Date
    },
    exitReason: {
        type: String,
        enum: ['TARGET', 'STOP', 'MAX_HOLDING', 'REVERSAL', 'DELISTED', 'MIGRATION', 'MANUAL']
    },
    holdingDays: {
        type: Number
    },
    status: {
        type: String,
        enum: ['OPEN', 'HIT_TARGET', 'HIT_SL', 'CLOSED', 'WATCHLIST', 'NEEDS_REVIEW'],
        default: 'OPEN',
        index: true
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
    lastUpdatedAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Immutable idempotency key. Includes direction and timeframe so a same-day
// BUY and SELL can coexist.
//
// Partial so documents written by a not-yet-updated Lambda (which do not have
// a signalKey) cannot collide with each other on a missing field during the
// migration/deploy window. Every new signal always has a key and is unique.
SignalSchema.index(
    { signalKey: 1 },
    {
        unique: true,
        partialFilterExpression: { signalKey: { $exists: true } },
    }
);

// Query path used by reconciliation/dedupe and reporting.
SignalSchema.index({ strategy: 1, symbol: 1, signal: 1, status: 1, date: -1 });

export const Signal = mongoose.model<ISignal>('Signal', SignalSchema);
