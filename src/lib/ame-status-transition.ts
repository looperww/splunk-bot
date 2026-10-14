function isNewToClosedTransitionError(message:string):boolean{
  return /selected status\b.*\bnot valid after new\b/i.test(message);
}

export async function closeAmeStatusThroughAllowedTransition(
  updateStatus:(statusId:string,comment:string)=>Promise<string|null>,
  closedStatusId:string,
  inProgressStatusId:string,
  reason:string,
):Promise<string|null>{
  if(closedStatusId===inProgressStatusId){
    return "The AME in-progress and closed status identifiers must be different.";
  }

  let error=await updateStatus(closedStatusId,reason);
  if(!error||!isNewToClosedTransitionError(error)) return error;

  error=await updateStatus(inProgressStatusId,"");
  if(error) return "AME rejected the required transition to In Progress. "+error;

  return updateStatus(closedStatusId,reason);
}
