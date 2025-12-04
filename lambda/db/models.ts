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
