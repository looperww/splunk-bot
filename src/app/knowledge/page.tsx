import { cookies } from "next/headers";
import KnowledgePanel, { type Knowledge } from "@/components/knowledge-panel";
import { getCurrentUser } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { getSplunkKnowledge } from "@/lib/splunk-knowledge";

const SELECTED_CONNECTION_COOKIE="splunk-bot-connection-id";

async function getInitialKnowledge(){
  try{
    const [user,cookieStore]=await Promise.all([getCurrentUser(),cookies()]);
    if(!user) return {connection:null,knowledge:null};

    const connections=await listConnections();
    const preferredId=cookieStore.get(SELECTED_CONNECTION_COOKIE)?.value;
    const connection=connections.find((item)=>item.id===preferredId)??connections[0]??null;
    if(!connection) return {connection:null,knowledge:null};

    return {connection,knowledge:await getSplunkKnowledge(connection.id)};
  }catch{
    return {connection:null,knowledge:null};
  }
}

export default async function KnowledgePage(){
  const initial=await getInitialKnowledge();
  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">SPLUNK ENVIRONMENT CACHE</div>
        <h1>Knowledge</h1>
        <p>Review the indexes, sourcetypes, data models, roles, and capabilities cached for the selected Splunk connection.</p>
      </div>
    </header>
    <KnowledgePanel
      initialConnection={initial.connection}
      initialKnowledge={initial.knowledge as unknown as Knowledge|null}
    />
  </main>;
}
