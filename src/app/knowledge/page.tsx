import KnowledgePanel from "@/components/knowledge-panel";

export default function KnowledgePage(){
  return <main className="page-shell">
    <header className="page-heading">
      <div>
        <div className="eyebrow">SPLUNK ENVIRONMENT CACHE</div>
        <h1>Knowledge</h1>
        <p>Review the indexes, sourcetypes, data models, roles, and capabilities cached for the selected Splunk connection.</p>
      </div>
    </header>
    <KnowledgePanel/>
  </main>;
}
