import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { studentName } from "@/data/demo";
import { User, Bell, Shield, Palette, HelpCircle } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Customize your experience.</p>
      </div>

      {/* Profile */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gradient-calm flex items-center justify-center">
              <span className="text-2xl font-bold text-primary-foreground">A</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">{studentName}</p>
              <p className="text-sm text-muted-foreground">State University · Sophomore</p>
              <p className="text-sm text-muted-foreground">Major: Psychology</p>
            </div>
          </div>
          <Button variant="outline" size="sm">Edit Profile</Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> Reminders & Notifications
          </CardTitle>
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
              <p className="text-xs text-muted-foreground">Gentle, Standard, or High</p>
            </div>
            <Badge variant="secondary">Gentle</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Work shift reminders</p>
              <p className="text-xs text-muted-foreground">1 hour before shift</p>
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
