import { FormEvent, useState } from "react";
import { CheckCircle2, KeyRound, Save, UserCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Superadmin",
  GROUP_INTEGRATOR: "Group Integrator",
  BU_INTEGRATOR: "BU Integrator",
};

// Self-service account page: any logged-in user can update their own
// name/email/username and change their password here. Description, role,
// Custom Role, and Business Unit assignment are superadmin-only (see
// Admin -> Users) and are shown here read-only for context, not editable.
export default function Profile() {
  const { user, updateProfile, changePassword } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [username, setUsername] = useState(user?.username || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      await updateProfile({ name, email, username: username.trim() ? username.trim() : null });
      setProfileSaved(true);
    } catch (err: any) {
      setProfileError(err.message || "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("New password must be different from your current password");
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">My Profile</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Update your account details or change your password.</p>
      </div>

      <div className="flex items-start gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <UserCircle className="h-10 w-10 shrink-0 text-brand-500 dark:text-brand-400" />
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {user?.role ? ROLE_LABELS[user.role] : "No base role"}
            {user?.customRoleIds?.length
              ? ` · ${user.customRoleIds.length} Custom Role${user.customRoleIds.length === 1 ? "" : "s"} assigned`
              : ""}
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {user?.description ? user.description : <span className="text-slate-400 dark:text-slate-500">No description set by your administrator.</span>}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500">
            Your role and description are managed by a Superadmin under Admin → Users.
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveProfile} className="flex flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Account details</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Name</label>
            <input
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</label>
            <input
              type="email"
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Username (optional)</label>
            <input
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </div>

        {profileError && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{profileError}</div>}

        <button
          type="submit"
          disabled={profileSaving}
          className="flex w-fit items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {profileSaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {profileSaving ? "Saving..." : profileSaved ? "Saved" : "Save changes"}
        </button>
      </form>

      <form onSubmit={handleChangePassword} className="flex flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Change password</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Current password</label>
            <input
              type="password"
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">New password</label>
            <input
              type="password"
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Confirm new password</label>
            <input
              type="password"
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">At least 8 characters, with letters and numbers.</span>

        {passwordError && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{passwordError}</div>}

        <button
          type="submit"
          disabled={passwordSaving}
          className="flex w-fit items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {passwordSaved ? <CheckCircle2 className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          {passwordSaving ? "Saving..." : passwordSaved ? "Password updated" : "Change password"}
        </button>
      </form>
    </div>
  );
}
