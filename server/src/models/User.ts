import mongoose, { Document, Model, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export enum UserRole {
    PLAIN = 'PLAIN',
    ADMIN = 'ADMIN'
}

export interface IUser extends Document {
    email?: string;
    passwordHash?: string;
    firstName?: string;
    lastName?: string;
    nickname?: string;
    preferNickname: boolean;
    role: UserRole;
    refreshToken?: string;
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
    createdAt: Date;
    updatedAt: Date;
    matchPassword(enteredPassword: string): Promise<boolean>;
}

interface IUserModel extends Model<IUser> {
    findByEmail(email: string): Promise<IUser | null>;
}

const UserSchema: Schema = new Schema({
    email: {
        type: String,
        required: false,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    passwordHash: {
        type: String,
        required: false
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
    refreshToken: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date
}, {
    timestamps: true
});

UserSchema.index(
    { email: 1 },
    {
        unique: true,
        partialFilterExpression: { email: { $type: "string" } }
    }
);

UserSchema.pre<IUser>('save', async function () {
    if (this.email && this.isModified('email')) {
        this.email = this.email.toLowerCase();
    }
    if (!this.passwordHash || !this.isModified('passwordHash')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

UserSchema.methods.matchPassword = async function (enteredPassword: string): Promise<boolean> {
    if (!this.passwordHash) return false;
    return await bcrypt.compare(enteredPassword, this.passwordHash);
};

UserSchema.statics.findByEmail = function (email: string): Promise<IUser | null> {
    return this.findOne({ email: email.toLowerCase() });
};

export default mongoose.model<IUser, IUserModel>('User', UserSchema);
