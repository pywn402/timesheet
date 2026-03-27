"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "登入失敗");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-[22px] font-semibold text-white">工時管理系統</h1>
          <p className="text-[13px] text-[#8d8d8d] mt-1">請登入以繼續</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#161616] border border-[#393939] rounded-2xl p-6 flex flex-col gap-4"
        >
          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] text-[#a8a8a8] uppercase tracking-wider">帳號</label>
            <div className="relative">
              <select
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                className="w-full bg-[#262626] border border-[#393939] rounded-lg px-3 py-2.5 pr-9 text-[14px] text-white outline-none focus:border-[#0f62fe] transition-colors appearance-none cursor-pointer"
              >
                <option value="" disabled className="text-[#6f6f6f]">選擇姓名</option>
                {["Phoebe", "Lu Ju", "Mark", "Wen", "Erin"].map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6f6f6f] pointer-events-none" />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] text-[#a8a8a8] uppercase tracking-wider">密碼</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="輸入密碼"
                autoComplete="current-password"
                className="w-full bg-[#262626] border border-[#393939] rounded-lg px-3 py-2.5 pr-9 text-[14px] text-white placeholder-[#6f6f6f] outline-none focus:border-[#0f62fe] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6f6f6f] hover:text-[#a8a8a8] transition-colors"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[13px] text-[#fa4d56] bg-[#2d1516] border border-[#520408] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="mt-1 bg-[#0f62fe] hover:bg-[#0353e9] disabled:bg-[#393939] disabled:text-[#6f6f6f] disabled:cursor-not-allowed text-white text-[14px] font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? "登入中..." : "登入"}
          </button>
        </form>
      </div>
    </div>
  );
}
