import { NextRequest, NextResponse } from "next/server";
import { deleteConnection, getConnection } from "@/lib/connections";

export async function DELETE(
  _request:NextRequest,
  context:{params:Promise<{id:string}>},
){
  try{
    const {id}=await context.params;
    const connection=await getConnection(id);

    if(!connection){
      return NextResponse.json(
        {error:"Splunk connection not found."},
        {status:404},
      );
    }

    await deleteConnection(id);

    return NextResponse.json({
      ok:true,
      connectionId:id,
    });
  }catch(error){
    return NextResponse.json(
      {
        ok:false,
        error:error instanceof Error
          ?error.message
          :"Failed to delete Splunk connection.",
      },
      {status:400},
    );
  }
}
