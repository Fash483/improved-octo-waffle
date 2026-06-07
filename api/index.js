import { NextResponse } from 'next/server';
import { Client, Databases, ID } from 'node-appwrite';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Initialize Appwrite Client
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT!)
      .setProject(process.env.APPWRITE_PROJECT_ID!)
      .setKey(process.env.APPWRITE_API_KEY!);

    const databases = new Databases(client);

    // Add document to your collection
    const response = await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID!,
      process.env.APPWRITE_COLLECTION_ID!,
      ID.unique(),
      {
        id: body.id,
        title: body.title,
        url: body.url,
        created_at: body.created_at
      }
    );

    return NextResponse.json({ success: true, data: response });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
