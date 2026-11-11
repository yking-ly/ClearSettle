import { NextResponse } from "next/server";

import { generateReminder } from "@/lib/ai/reminder-generator";
import { apiAuthFailure } from "@/lib/auth/server";
import { reminderContextSchema } from "@/lib/reminder";

export async function POST(request: Request) {
  const authFailure = await apiAuthFailure();
  if (authFailure) return authFailure;

  try {
    const context = reminderContextSchema.parse(await request.json());
    return NextResponse.json(await generateReminder(context));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create a reminder draft";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
