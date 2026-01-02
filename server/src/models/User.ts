import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export enum UserRole {
    PLAIN = 'PLAIN',
    ADMIN = 'ADMIN'
}

export interface IUser extends Document {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
    nickname?: string;
    preferNickname: boolean;
    role: UserRole;
    refreshToken?: string;
    createdAt: Date;
    updatedAt: Date;
    matchPassword(enteredPassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    passwordHash: {
        type: String,
        required: true
    },
    firstName: String,
    lastName: String,
    nickname: String,
    preferNickname: {
        type: Boolean,
        default: false
    },
    role: {
        type: String,
        enum: Object.values(UserRole),
        default: UserRole.PLAIN
    },
    refreshToken: String
}, {
    timestamps: true
});

// Middleware to hash password before saving
UserSchema.pre<IUser>('save', async function () {
    if (!this.isModified('passwordHash')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

UserSchema.methods.matchPassword = async function (enteredPassword: string): Promise<boolean> {
    return await bcrypt.compare(enteredPassword, this.passwordHash);
};

export default mongoose.model<IUser>('User', UserSchema);
