import { authHandler } from "@/lib/auth/server";

type Context = { params: Promise<{ path: string[] }> };

export function GET(request: Request, context: Context) {
  return authHandler().GET(request, context);
}

export function POST(request: Request, context: Context) {
  return authHandler().POST(request, context);
}

export function PUT(request: Request, context: Context) {
  return authHandler().PUT(request, context);
}

export function DELETE(request: Request, context: Context) {
  return authHandler().DELETE(request, context);
}

export function PATCH(request: Request, context: Context) {
  return authHandler().PATCH(request, context);
}
