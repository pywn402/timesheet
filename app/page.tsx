"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, LogOut, KeyRound, Check, Copy, Pencil } from "lucide-react";

const ADMIN_USER = "Phoebe";

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const NUM_MONTHS = 12;

// Working days per month (index 0 = January)
const WORKING_DAYS = [25, 20, 22, 22, 21, 22, 23, 21, 22, 22, 21, 23];

function monthWorkInfo(month: number) {
  const days = WORKING_DAYS[month - 1];
  const full = days * 8;
  const p75 = Math.ceil(full * 0.75);
  const p60 = Math.ceil(full * 0.60);
  return { days, full, p75, p60 };
}

interface MonthInfo {
  year: number;
  month: number;
  weeks: string[];
}

interface MonthData {
  allocatedHours: number;
  weeklyActual: Record<string, number>;
}

interface MultiMonthRow {
  projectId: number;
  projectCode: string;
  projectName: string;
  employeeId: number;
  employeeName: string;
  totalAllocated: number;
  totalActual: number;
  monthData: Record<string, MonthData>;
}

interface Employee {
  id: number;
  name: string;
}

interface MultiMonthData {
  months: MonthInfo[];
  rows: MultiMonthRow[];
  employees: Employee[];
}



function EditableCell({
  value,
  onSave,
  textColor = "text-[#8d8d8d]",
  className = "",
  colSpan,
  readOnly = false,
  footer,
}: {
  value: number;
  onSave: (v: number) => void;
  textColor?: string;
  className?: string;
  colSpan?: number;
  readOnly?: boolean;
  footer?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value));

  useEffect(() => {
    if (!editing) setInput(String(value));
  }, [value, editing]);

  const commit = () => {
    onSave(Math.max(0, parseInt(input) || 0));
    setEditing(false);
  };

  if (editing && !readOnly) {
    return (
      <td colSpan={colSpan} className={`px-1 py-0.5 ${className}`}>
        <input
          className="w-full min-w-[44px] text-center text-[13px] bg-[#edf5ff] border border-[#0f62fe] rounded outline-none text-[#161616] py-0.5"
          value={input}
          autoFocus
          onChange={(e) => setInput(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setInput(String(value)); setEditing(false); }
          }}
        />
      </td>
    );
  }

  return (
    <td
      colSpan={colSpan}
      onClick={() => { if (!readOnly) setEditing(true); }}
      className={`text-center text-[13px] px-2 py-2 transition-colors ${textColor} ${className} ${readOnly ? "cursor-default" : "cursor-pointer hover:bg-[#e8e8e8]"}`}
    >
      {value > 0 ? value : <span className="text-[#d0d0d0] text-[10px]">–</span>}
      {footer && <div className="text-[10px] mt-0.5">{footer}</div>}
    </td>
  );
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="font-mono text-[11px] font-bold text-[#0f62fe] bg-[#edf5ff] px-1.5 py-0.5 rounded">{code}</span>
      <button onClick={handleCopy} className="text-[#6f6f6f] hover:text-[#525252] transition-colors">
        {copied ? <Check size={11} className="text-[#24a148]" /> : <Copy size={11} />}
      </button>
    </div>
  );
}

// Inline-editable number for plan hours inside the month header
function EditableNumber({
  value,
  onSave,
  readOnly,
}: {
  value: number;
  onSave: (v: number) => void;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value));

  useEffect(() => { if (!editing) setInput(String(value)); }, [value, editing]);

  const commit = () => { onSave(Math.max(0, parseInt(input) || 0)); setEditing(false); };

  if (editing) {
    return (
      <input
        className="w-14 text-center text-[12px] bg-[#edf5ff] border border-[#0f62fe] rounded outline-none text-[#161616] py-0.5"
        value={input}
        autoFocus
        onChange={(e) => setInput(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setInput(String(value)); setEditing(false); }
        }}
      />
    );
  }
  return (
    <span
      onClick={() => { if (!readOnly) setEditing(true); }}
      className={`text-[#0f62fe] font-semibold ${readOnly ? "" : "cursor-pointer hover:opacity-70"}`}
    >
      {value > 0 ? value : "—"}
    </span>
  );
}

function EmployeeSection({
  employee,
  rows,
  months,
  isAdmin,
  currentUser,
  onSaveAllocation,
  onSaveActual,
  onDelete,
  onEdit,
}: {
  employee: Employee;
  rows: MultiMonthRow[];
  months: MonthInfo[];
  isAdmin: boolean;
  currentUser: string;
  onSaveAllocation: (projectId: number, employeeId: number, year: number, month: number, hours: number) => void;
  onSaveActual: (projectId: number, employeeId: number, weekStart: string, year: number, month: number, hours: number) => void;
  onDelete: (projectId: number, employeeId: number, name: string) => void;
  onEdit: (projectId: number, code: string, name: string) => void;
}) {
  const emp_initials = employee.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div id={`emp-${employee.id}`}>
      {/* Employee header */}
      <div className="flex items-center gap-2.5 mb-3 px-1">
        <div className="w-7 h-7 rounded-full bg-[#edf5ff] border border-[#0f62fe] flex items-center justify-center text-[11px] font-bold text-[#0f62fe] shrink-0">
          {emp_initials}
        </div>
        <span className="text-[14px] font-semibold text-[#161616]">{employee.name}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-[12px] text-[#6f6f6f] px-1">尚無分配專案</p>
      ) : (
        <div className="rounded-xl border border-[#e0e0e0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                {/* Month row */}
                <tr className="bg-white border-b border-[#e0e0e0]">
                  {months.map((mi, mIdx) => {
                    const isLast = mIdx === months.length - 1;
                    const wi = monthWorkInfo(mi.month);
                    return (
                      <th
                        key={`${mi.year}-${mi.month}`}
                        colSpan={mi.weeks.length}
                        className={`px-2 py-1.5 text-left text-[11px] font-medium text-[#8d8d8d] ${!isLast ? "border-r border-[#e0e0e0]" : ""}`}
                      >
                        <div>{mi.year !== months[0].year ? `${mi.year} ` : ""}{MONTH_NAMES[mi.month - 1]}</div>
                        {isAdmin && (
                          <div className="mt-0.5 flex flex-col gap-px">
                            <span className="text-[9.5px] text-[#a8a8a8] font-normal">{wi.days}天 · {wi.full}h</span>
                            <span className="text-[9.5px] text-[#a8a8a8] font-normal">75%→{wi.p75} · 60%→{wi.p60}</span>
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const isLastRow = rowIdx === rows.length - 1;
                  return (
                    <React.Fragment key={`${row.projectId}-${row.employeeId}`}>
                      {/* Project name divider row */}
                      <tr className="bg-[#0f62fe]/10 border-t border-[#0f62fe]/20">
                        <td colSpan={months.reduce((s, mi) => s + mi.weeks.length, 0)} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-[#000000]">{row.projectName}</span>
                            <CopyableCode code={row.projectCode} />
                            {isAdmin && (
                              <button
                                onClick={() => onEdit(row.projectId, row.projectCode, row.projectName)}
                                className="text-[#6f6f6f] hover:text-[#0f62fe] transition-colors shrink-0"
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => onDelete(row.projectId, row.employeeId, row.employeeName)}
                                className="text-[#6f6f6f] hover:text-[#da1e28] transition-colors shrink-0"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Plan info row */}
                      <tr className="bg-[#fafafa]">
                        {months.map((mi, mIdx) => {
                          const monthKey = `${mi.year}-${mi.month}`;
                          const md = row.monthData[monthKey];
                          const mAlloc = md?.allocatedHours ?? 0;
                          const mActual = Object.values(md?.weeklyActual ?? {}).reduce((s, v) => s + v, 0);
                          const mRemaining = mAlloc - mActual;
                          const isLastMonth = mIdx === months.length - 1;
                          const remainColor = mAlloc === 0
                            ? "text-[#6f6f6f]"
                            : mRemaining < 0 ? "text-[#da1e28]"
                            : mRemaining === 0 ? "text-[#24a148]"
                            : "text-[#161616]";
                          return (
                            <td
                              key={monthKey}
                              colSpan={mi.weeks.length}
                              className={`px-3 py-1.5 ${!isLastMonth ? "border-r border-[#e0e0e0]" : ""}`}
                            >
                              <div className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                                <span className="text-[#6f6f6f]">計畫</span>
                                <EditableNumber
                                  value={mAlloc}
                                  onSave={(h) => onSaveAllocation(row.projectId, row.employeeId, mi.year, mi.month, h)}
                                  readOnly={!isAdmin}
                                />
                                <span className="text-[#8d8d8d] mx-0.5">|</span>
                                <span className="text-[#6f6f6f]">剩餘</span>
                                <span className={remainColor}>{mAlloc === 0 ? "—" : mRemaining}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      {/* Actual hours row */}
                      <tr className={`bg-white ${!isLastRow ? "border-b-2 border-[#e0e0e0]" : ""}`}>
                        {months.flatMap((mi, mIdx) => {
                          const monthKey = `${mi.year}-${mi.month}`;
                          const md = row.monthData[monthKey];
                          const isLastMonth = mIdx === months.length - 1;
                          return mi.weeks.map((week, wIdx) => {
                            const isLastWeek = wIdx === mi.weeks.length - 1;
                            const borderClass = isLastWeek && !isLastMonth
                              ? "border-r border-[#e0e0e0]"
                              : "border-r border-[#e8e8e8]";
                            return (
                              <EditableCell
                                key={`${mi.year}-${mi.month}-${week}`}
                                value={md?.weeklyActual[week] ?? 0}
                                onSave={(h) => onSaveActual(row.projectId, row.employeeId, week, mi.year, mi.month, h)}
                                textColor="text-[#24a148]"
                                className={borderClass}
                                readOnly={currentUser !== employee.name}
                              />
                            );
                          });
                        })}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [startYear, setStartYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<MultiMonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const isAdmin = currentUser === ADMIN_USER;

  // Fetch current user from JWT session
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((session) => {
        if (!session) { router.replace("/login"); return; }
        setCurrentUser(session.name);
        setAuthReady(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  // Password management state (admin only)
  const [showPwModal, setShowPwModal] = useState(false);
  type PwState = { pw: string; loading: boolean; done: boolean; error: string };
  const [pwForms, setPwForms] = useState<Record<number, PwState>>({});
  const setPw = (id: number, patch: Partial<PwState>) =>
    setPwForms((prev) => {
      const base: PwState = prev[id] ?? { pw: "", loading: false, done: false, error: "" };
      return { ...prev, [id]: { ...base, ...patch } };
    });
  const savePassword = async (emp: Employee) => {
    const pw = pwForms[emp.id]?.pw ?? "";
    if (pw.length < 6) { setPw(emp.id, { error: "至少 6 個字元" }); return; }
    setPw(emp.id, { loading: true, error: "" });
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: emp.id, newPassword: pw }),
    });
    const json = await res.json();
    if (!res.ok) { setPw(emp.id, { loading: false, error: json.error ?? "失敗" }); return; }
    setPw(emp.id, { loading: false, done: true, pw: "" });
    setTimeout(() => setPw(emp.id, { done: false }), 2000);
  };

  const [editProject, setEditProject] = useState<{ id: number; code: string; name: string } | null>(null);
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const saveEditProject = async () => {
    if (!editProject) return;
    if (!editProject.code.trim() || !editProject.name.trim()) { setEditError("代碼與名稱不能為空"); return; }
    setEditLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editProject.id, code: editProject.code.trim(), name: editProject.name.trim() }),
      });
      if (!res.ok) { setEditError((await res.json()).error ?? "更新失敗"); return; }
      setEditProject(null);
      await load();
    } finally {
      setEditLoading(false);
    }
  };

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ projectCode: "", projectName: "", employeeName: "", selectedProjectId: "" });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [allProjects, setAllProjects] = useState<{ id: number; code: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/timesheets?startYear=${startYear}&startMonth=1&numMonths=${NUM_MONTHS}`
      );
      if (!res.ok) return;
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [startYear]);

  useEffect(() => { load(); }, [load]);

  // Fetch all existing projects when add modal opens
  useEffect(() => {
    if (showModal) {
      fetch("/api/projects")
        .then((r) => r.ok ? r.json() : [])
        .then(setAllProjects)
        .catch(() => {});
    }
  }, [showModal]);

  const prev = () => setStartYear((y) => y - 1);
  const next = () => setStartYear((y) => y + 1);

  const saveAllocation = async (
    projectId: number, employeeId: number, year: number, month: number, hours: number
  ) => {
    const monthKey = `${year}-${month}`;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => {
          if (row.projectId !== projectId || row.employeeId !== employeeId) return row;
          const existing = row.monthData[monthKey] ?? { allocatedHours: 0, weeklyActual: {} };
          const newMonthData = { ...row.monthData, [monthKey]: { ...existing, allocatedHours: hours } };
          const totalAllocated = Object.values(newMonthData).reduce((s, m) => s + m.allocatedHours, 0);
          return { ...row, monthData: newMonthData, totalAllocated };
        }),
      };
    });
    await fetch("/api/timesheets/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allocation", projectId, employeeId, year, month, hours }),
    });
  };

  const saveActual = async (
    projectId: number, employeeId: number,
    weekStart: string, year: number, month: number, hours: number
  ) => {
    const monthKey = `${year}-${month}`;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => {
          if (row.projectId !== projectId || row.employeeId !== employeeId) return row;
          const monthD = row.monthData[monthKey] ?? { allocatedHours: 0, weeklyActual: {} };
          const newWeeklyActual = { ...monthD.weeklyActual, [weekStart]: hours };
          const newMonthData = { ...row.monthData, [monthKey]: { ...monthD, weeklyActual: newWeeklyActual } };
          const totalActual = Object.values(newMonthData).reduce(
            (s, m) => s + Object.values(m.weeklyActual).reduce((a, b) => a + b, 0), 0
          );
          return { ...row, monthData: newMonthData, totalActual };
        }),
      };
    });
    await fetch("/api/timesheets/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "actual", projectId, employeeId, weekStart, hours }),
    });
  };

  const addRow = async () => {
    setFormError("");
    if (!form.projectCode.trim() || !form.projectName.trim() || !form.employeeName.trim()) {
      setFormError("請填寫專案代號、專案名稱，並選擇人員");
      return;
    }
    setFormLoading(true);
    try {
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectCode: form.projectCode.trim(),
          projectName: form.projectName.trim(),
          employeeName: form.employeeName.trim(),
          startYear, startMonth: 1, numMonths: NUM_MONTHS,
        }),
      });
      if (!res.ok) { setFormError((await res.json()).error ?? "新增失敗"); return; }
      setShowModal(false);
      setForm({ projectCode: "", projectName: "", employeeName: "", selectedProjectId: "" });
      await load();
    } finally {
      setFormLoading(false);
    }
  };

  const deleteRow = async (projectId: number, employeeId: number, name: string) => {
    if (!confirm(`確定刪除 ${name} 在此期間的工時分配？`)) return;
    const months = data?.months.map((m) => ({ year: m.year, month: m.month })) ?? [];
    await fetch("/api/timesheets/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, employeeId, months }),
    });
    await load();
  };

  const rangeLabel = data ? `${startYear}年` : "載入中...";

  if (!authReady || !currentUser) return (
    <div className="min-h-screen bg-[#f4f4f4] flex items-center justify-center text-[#6f6f6f] text-sm">
      載入中...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* Header */}
      <header className="bg-white border-b border-[#e0e0e0] px-6 py-0 flex items-center gap-6 h-14">
        <h1 className="text-[16px] font-semibold text-[#161616] whitespace-nowrap">IBM Design Team 工時管理</h1>
        <div className="flex items-center gap-1 bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg px-1 h-8">
          <button onClick={prev} className="p-1 rounded hover:bg-[#e0e0e0] text-[#8d8d8d] hover:text-[#0f62fe] transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-[13px] text-[#161616] min-w-[200px] text-center">{rangeLabel}</span>
          <button onClick={next} className="p-1 rounded hover:bg-[#e0e0e0] text-[#8d8d8d] hover:text-[#0f62fe] transition-colors">
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="flex-1" />
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[13px] rounded-lg transition-colors"
          >
            <Plus size={14} />新增分配
          </button>
        )}
        <div className="flex items-center gap-2 ml-2 pl-4 border-l border-[#e0e0e0]">
          {isAdmin && (
            <button
              onClick={() => setShowPwModal(true)}
              title="管理密碼"
              className="p-1.5 text-[#6f6f6f] hover:text-[#0f62fe] transition-colors rounded hover:bg-[#e8e8e8]"
            >
              <KeyRound size={14} />
            </button>
          )}
          <div className="w-7 h-7 rounded-full bg-[#edf5ff] border border-[#0f62fe] flex items-center justify-center text-[11px] font-bold text-[#0f62fe]">
            {initials(currentUser)}
          </div>
          <span className="text-[13px] text-[#161616]">{currentUser}</span>
          {isAdmin && (
            <span className="text-[11px] bg-[#edf5ff] text-[#0f62fe] rounded px-1.5 py-0.5 font-medium">管理員</span>
          )}
          <button
            onClick={handleLogout}
            title="登出"
            className="p-1.5 text-[#6f6f6f] hover:text-[#da1e28] transition-colors rounded hover:bg-[#fff1f1]"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Anchor nav */}
      {!loading && data && (
        <div className="sticky top-0 z-40 bg-white border-b border-[#e0e0e0] px-6 py-2 flex items-center gap-2">
          {(data.employees ?? []).map((emp) => (
            <a
              key={emp.id}
              href={`#emp-${emp.id}`}
              className="px-3 py-1 text-[13px] text-[#525252] rounded-full border border-[#e0e0e0] hover:border-[#0f62fe] hover:text-[#0f62fe] transition-colors whitespace-nowrap"
            >
              {emp.name}
            </a>
          ))}
        </div>
      )}

      <div className="px-6 py-5 max-w-[1800px] mx-auto">
        {/* Employee sections */}
        {loading ? (
          <div className="flex justify-center py-20 text-[#6f6f6f] text-sm">載入中...</div>
        ) : !data ? null : (
          <div className="space-y-10">
            {(data.employees ?? []).map((emp) => (
              <EmployeeSection
                key={emp.id}
                employee={emp}
                rows={data.rows.filter((r) => r.employeeId === emp.id)}
                months={data.months}
                isAdmin={isAdmin}
                currentUser={currentUser}
                onSaveAllocation={saveAllocation}
                onSaveActual={saveActual}
                onDelete={deleteRow}
                onEdit={(id, code, name) => { setEditProject({ id, code, name }); setEditError(""); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Project Modal */}
      {editProject && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setEditProject(null); }}
        >
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-6 w-[400px] shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-semibold text-[#161616]">編輯專案</h2>
              <button onClick={() => setEditProject(null)} className="text-[#6f6f6f] hover:text-[#161616] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { key: "code", label: "專案代碼 *" },
                { key: "name", label: "專案名稱 *" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-[11px] text-[#8d8d8d] mb-1.5 uppercase tracking-wider">{label}</label>
                  <input
                    className="w-full bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] transition-colors"
                    value={editProject[key as "code" | "name"]}
                    onChange={(e) => setEditProject((p) => p ? { ...p, [key]: e.target.value } : p)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEditProject(); }}
                    autoFocus={key === "code"}
                  />
                </div>
              ))}
              {editError && <p className="text-[#da1e28] text-[12px] bg-[#fff1f1] border border-[#ffd7d9] rounded-lg px-3 py-2">{editError}</p>}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => setEditProject(null)}
                  className="px-4 py-2 text-[13px] text-[#a8a8a8] border border-[#e0e0e0] rounded-lg hover:bg-[#e8e8e8] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={saveEditProject}
                  disabled={editLoading}
                  className="px-4 py-2 text-[13px] bg-[#0f62fe] hover:bg-[#0353e9] text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {editLoading ? "儲存中..." : "儲存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setFormError(""); setForm({ projectCode: "", projectName: "", employeeName: "", selectedProjectId: "" }); } }}
        >
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-6 w-[460px] shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[15px] font-semibold text-[#161616]">新增工時分配</h2>
                <p className="text-[12px] text-[#8d8d8d] mt-0.5">{rangeLabel}</p>
              </div>
              <button onClick={() => { setShowModal(false); setFormError(""); setForm({ projectCode: "", projectName: "", employeeName: "", selectedProjectId: "" }); }} className="text-[#6f6f6f] hover:text-[#161616] transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Project selector */}
              <div>
                <label className="block text-[11px] text-[#8d8d8d] mb-1.5 uppercase tracking-wider">專案 *</label>
                <select
                  autoFocus
                  className="w-full bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] transition-colors appearance-none cursor-pointer"
                  value={form.selectedProjectId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__new__") {
                      setForm((f) => ({ ...f, selectedProjectId: "__new__", projectCode: "", projectName: "" }));
                    } else {
                      const proj = allProjects.find((p) => String(p.id) === val);
                      setForm((f) => ({ ...f, selectedProjectId: val, projectCode: proj?.code ?? "", projectName: proj?.name ?? "" }));
                    }
                  }}
                >
                  <option value="" disabled>選擇現有專案 / 新增</option>
                  {allProjects.map((p) => (
                    <option key={p.id} value={String(p.id)}>{p.code}　{p.name}</option>
                  ))}
                  <option value="__new__">＋ 輸入新專案</option>
                </select>
              </div>

              {/* Manual inputs — only when "新增" selected */}
              {form.selectedProjectId === "__new__" && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "projectCode", label: "專案代號 *", placeholder: "例：TWCQ3UY" },
                    { key: "projectName", label: "專案名稱 *", placeholder: "例：HNCB CIB" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="block text-[11px] text-[#8d8d8d] mb-1.5 uppercase tracking-wider">{label}</label>
                      <input
                        className="w-full bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] text-[#161616] placeholder-[#6f6f6f] outline-none focus:border-[#0f62fe] transition-colors"
                        value={form[key as "projectCode" | "projectName"]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        autoComplete="off"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Preview selected project */}
              {form.selectedProjectId && form.selectedProjectId !== "__new__" && (
                <div className="flex gap-3 bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg px-3 py-2">
                  <span className="text-[12px] font-mono text-[#0f62fe]">{form.projectCode}</span>
                  <span className="text-[12px] text-[#8d8d8d]">{form.projectName}</span>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-[#8d8d8d] mb-1.5 uppercase tracking-wider">人員 *</label>
                <select
                  className="w-full bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] transition-colors appearance-none cursor-pointer"
                  value={form.employeeName}
                  onChange={(e) => setForm((f) => ({ ...f, employeeName: e.target.value }))}
                >
                  <option value="" disabled className="text-[#6f6f6f]">選擇人員</option>
                  {(data?.employees ?? []).map((emp) => (
                    <option key={emp.id} value={emp.name}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-[#6f6f6f]">新增後可點擊計畫列格子設定各月分配工時。</p>

              {formError && (
                <p className="text-[#da1e28] text-[12px] bg-[#fff1f1] border border-[#ffd7d9] rounded-lg px-3 py-2">{formError}</p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => { setShowModal(false); setFormError(""); setForm({ projectCode: "", projectName: "", employeeName: "", selectedProjectId: "" }); }}
                  className="px-4 py-2 text-[13px] text-[#a8a8a8] border border-[#e0e0e0] rounded-lg hover:bg-[#e8e8e8] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={addRow}
                  disabled={formLoading}
                  className="px-4 py-2 text-[13px] bg-[#0f62fe] hover:bg-[#0353e9] text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {formLoading ? "新增中..." : "新增"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Management Modal (admin only) */}
      {showPwModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPwModal(false); }}
        >
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-6 w-[420px] shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[15px] font-semibold text-[#161616]">管理密碼</h2>
                <p className="text-[12px] text-[#8d8d8d] mt-0.5">為每位成員設定或重設登入密碼</p>
              </div>
              <button onClick={() => setShowPwModal(false)} className="text-[#6f6f6f] hover:text-[#161616] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {(data?.employees ?? []).map((emp) => {
                const s = pwForms[emp.id] ?? { pw: "", loading: false, done: false, error: "" };
                return (
                  <div key={emp.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#edf5ff] border border-[#0f62fe] flex items-center justify-center text-[9px] font-bold text-[#0f62fe] shrink-0">
                        {initials(emp.name)}
                      </div>
                      <span className="text-[13px] text-[#161616] w-20 shrink-0">{emp.name}</span>
                      <input
                        type="password"
                        placeholder="新密碼（至少 6 字元）"
                        value={s.pw}
                        onChange={(e) => setPw(emp.id, { pw: e.target.value, error: "", done: false })}
                        onKeyDown={(e) => { if (e.key === "Enter") savePassword(emp); }}
                        className="flex-1 bg-[#f4f4f4] border border-[#e0e0e0] rounded-lg px-3 py-1.5 text-[12px] text-[#161616] placeholder-[#6f6f6f] outline-none focus:border-[#0f62fe] transition-colors"
                      />
                      <button
                        onClick={() => savePassword(emp)}
                        disabled={s.loading || !s.pw}
                        className="px-3 py-1.5 text-[12px] bg-[#0f62fe] hover:bg-[#0353e9] disabled:bg-[#e0e0e0] disabled:text-[#6f6f6f] text-white rounded-lg transition-colors shrink-0"
                      >
                        {s.done ? <Check size={13} /> : s.loading ? "..." : "設定"}
                      </button>
                    </div>
                    {s.error && <p className="text-[11px] text-[#da1e28] pl-8">{s.error}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
