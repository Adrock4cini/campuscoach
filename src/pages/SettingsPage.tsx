import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { studentProfile } from "@/data/demo";
import { User, Bell, Shield, Palette, HelpCircle, Pencil, Save, X, Clock, Brain } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const [editing, setEditing] = useState<string | null>(null);
  const [profile, setProfile] = useState({ ...studentProfile });

  const handleSave = (section: string) => {
    setEditing(null);
    toast.success("Settings saved!", { description: `Your ${section} preferences have been updated.` });
  };

  const updateProfile = (key: string, value: string | number) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Customize your experience.</p>
      </div>

      {/* Profile */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> Profile
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setEditing(editing === "profile" ? null : "profile")}>
              {editing === "profile" ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
              {editing === "profile" ? "Cancel" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing === "profile" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={profile.name} onChange={e => updateProfile("name", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">School</Label>
                  <Input value={profile.school} onChange={e => updateProfile("school", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Major</Label>
                  <Input value={profile.major} onChange={e => updateProfile("major", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Year</Label>
                  <Select value={profile.year} onValueChange={v => updateProfile("year", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Freshman">Freshman</SelectItem>
                      <SelectItem value="Sophomore">Sophomore</SelectItem>
                      <SelectItem value="Junior">Junior</SelectItem>
                      <SelectItem value="Senior">Senior</SelectItem>
                      <SelectItem value="Graduate">Graduate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Semester Start</Label>
                  <Input type="date" value={profile.semesterStart} onChange={e => updateProfile("semesterStart", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Semester End</Label>
                  <Input type="date" value={profile.semesterEnd} onChange={e => updateProfile("semesterEnd", e.target.value)} />
                </div>
              </div>
              <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground" onClick={() => handleSave("profile")}>
                <Save className="h-3 w-3 mr-1" /> Save Profile
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-gradient-calm flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary-foreground">{profile.name[0]}</span>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{profile.name}</p>
                  <p className="text-sm text-muted-foreground">{profile.school} · {profile.year}</p>
                  <p className="text-sm text-muted-foreground">Major: {profile.major}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>📅 Semester: {new Date(profile.semesterStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(profile.semesterEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Study Preferences */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" /> Study Preferences
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setEditing(editing === "study" ? null : "study")}>
              {editing === "study" ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
              {editing === "study" ? "Cancel" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing === "study" ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Default Study Session Length</Label>
                <Select value={String(profile.defaultStudyLength)} onValueChange={v => updateProfile("defaultStudyLength", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="25">25 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Focus Sprint Default</Label>
                <Select value={String(profile.focusSprintDefault)} onValueChange={v => updateProfile("focusSprintDefault", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="25">25 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Encouragement Tone</Label>
                <Select value={profile.encouragementTone} onValueChange={v => updateProfile("encouragementTone", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warm">Warm & Supportive</SelectItem>
                    <SelectItem value="direct">Direct & Clear</SelectItem>
                    <SelectItem value="playful">Playful & Fun</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground" onClick={() => handleSave("study")}>
                <Save className="h-3 w-3 mr-1" /> Save Preferences
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Default study length</p>
                  <p className="text-xs text-muted-foreground">For study sessions and sprints</p>
                </div>
                <Badge variant="secondary">{profile.defaultStudyLength} min</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Focus Sprint default</p>
                  <p className="text-xs text-muted-foreground">Quick study timer</p>
                </div>
                <Badge variant="secondary">{profile.focusSprintDefault} min</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Encouragement tone</p>
                  <p className="text-xs text-muted-foreground">How the app talks to you</p>
                </div>
                <Badge variant="secondary" className="capitalize">{profile.encouragementTone}</Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" /> Reminders & Notifications
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setEditing(editing === "notif" ? null : "notif")}>
              {editing === "notif" ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
              {editing === "notif" ? "Done" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Class reminders</p>
              <p className="text-xs text-muted-foreground">30 minutes before class</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Assignment due dates</p>
              <p className="text-xs text-muted-foreground">1 day before deadline</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Study reminders</p>
              <p className="text-xs text-muted-foreground">Daily check-ins</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Accountability mode</p>
              <p className="text-xs text-muted-foreground">Controls reminder intensity</p>
            </div>
            {editing === "notif" ? (
              <Select value={profile.reminderStyle} onValueChange={v => updateProfile("reminderStyle", v)}>
                <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gentle">Gentle</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary" className="capitalize">{profile.reminderStyle}</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Work shift reminders</p>
              <p className="text-xs text-muted-foreground">1 hour before shift</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Exam countdown alerts</p>
              <p className="text-xs text-muted-foreground">7 days, 3 days, and 1 day before</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Tuition / academic deadlines</p>
              <p className="text-xs text-muted-foreground">1 week before important dates</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Privacy & Sharing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Parent/Mentor view</p>
              <p className="text-xs text-muted-foreground">Share limited progress with a trusted person</p>
            </div>
            <Switch />
          </div>
          <p className="text-xs text-muted-foreground">
            You control exactly what is shared. Notes and recordings are never shared unless you choose to.
          </p>
        </CardContent>
      </Card>

      {/* Help */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" /> Help & Support
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Need help? We're here for you.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">FAQ</Button>
            <Button variant="outline" size="sm">Contact Support</Button>
            <Button variant="outline" size="sm">Tutorial</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
