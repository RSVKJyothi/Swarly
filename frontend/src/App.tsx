import { useState } from "react";
import SongCoach from "./screens/SongCoach";
import SongCoachPractice from "./screens/SongCoachPractice";
import HomeScreen from "./screens/HomeScreen";
import LearnScreen from "./screens/LearnScreen";
import ExercisesScreen from "./screens/ExercisesScreen";
import ChatScreen from "./screens/ChatScreen";

export type Screen = "home" | "learn" | "practice" | "exercises" | "chat";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [practiceData, setPracticeData] = useState<{ songId: string; duration: number } | null>(null);

  if (screen === "practice") {
    if (practiceData) {
      return (
        <SongCoachPractice
          initialSongId={practiceData.songId}
          initialDuration={practiceData.duration}
          onBack={() => setPracticeData(null)}
        />
      );
    }
    return (
      <SongCoach
        onBack={() => setScreen("home")}
        onContinueToPractice={(songId, duration) => {
          setPracticeData({ songId, duration });
        }}
      />
    );
  }

  if (screen === "learn") {
    return <LearnScreen onBack={() => setScreen("home")} />;
  }

  if (screen === "exercises") {
    return <ExercisesScreen onBack={() => setScreen("home")} />;
  }
   
  if (screen === "chat") {
  return <ChatScreen onBack={() => setScreen("home")} />;
}
  return (
    <HomeScreen
      currentScreen={screen}
      onNavigate={setScreen}
    />
  );
}