import LearningPanel from "@/components/learning-panel";

export default function LearningPage(){
  return <main className="page-shell learning-page">
    <header className="page-heading">
      <div>
        <div className="eyebrow">ANALYST-CONFIRMED INTELLIGENCE</div>
        <h1>Decision Learning</h1>
        <p>Review the reusable patterns created from closed investigations before agents use them as scoped guidance.</p>
      </div>
    </header>
    <LearningPanel/>
  </main>;
}
