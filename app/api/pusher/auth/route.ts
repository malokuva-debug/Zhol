import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export async function POST(req: Request) {
  const formData = await req.formData();
  const socketId = formData.get("socket_id") as string;
  const channel = formData.get("channel_name") as string;
  const nickname = (formData.get("nickname") as string) || "Guest";
  const clientId = (formData.get("clientId") as string) || Math.random().toString(36).slice(2);

  // Only authorize our own presence channel naming convention
  if (!channel.startsWith("presence-")) {
    return NextResponse.json({ error: "Unauthorized channel." }, { status: 403 });
  }

  const authResponse = pusherServer().authorizeChannel(socketId, channel, {
    user_id: clientId,
    user_info: { nickname },
  });

  return NextResponse.json(authResponse);
}
