import type mongoose from "mongoose";

function mongooseIdJsonTransform(
  _doc: mongoose.Document,
  ret: Record<string, unknown> & { _id?: mongoose.Types.ObjectId; __v?: number; id?: string }
) {
  ret.id = ret._id?.toString();
  delete ret._id;
  delete ret.__v;
  return ret;
}

export const standardMongooseToJson = {
  virtuals: true,
  transform: mongooseIdJsonTransform,
} as const;
