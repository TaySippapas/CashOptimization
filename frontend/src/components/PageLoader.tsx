export default function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader-badge">
        <span className="page-loader-ring" />
        <img src="/ktb-logo.svg" alt="" className="page-loader-logo" />
      </div>
      <span className="page-loader-text">กำลังประมวลผล</span>
    </div>
  );
}
