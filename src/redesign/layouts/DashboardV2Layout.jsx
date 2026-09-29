import React from "react";
import BottomNavigation from "../components/BottomNavigation";

export default function DashboardV2Layout({ children, navigation }) {
  return (
    <div className="v2-theme v2-shell">
      <main className="v2-page">{children}</main>
      <BottomNavigation {...navigation} />
    </div>
  );
}
