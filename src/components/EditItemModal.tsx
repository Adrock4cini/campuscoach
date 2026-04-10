import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export interface EditField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface EditItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: EditField[];
  values: Record<string, string>;
  onSave: (values: Record<string, string>) => void;
}

export function EditItemModal({ open, onOpenChange, title, fields, values: initialValues, onSave }: EditItemModalProps) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues, open]);

  const handleSave = () => {
    onSave(values);
    onOpenChange(false);
    toast.success("Changes saved!", { description: "Your updates have been applied." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map(field => (
            <div key={field.key}>
              <Label className="text-xs">{field.label}</Label>
              {field.type === 'text' && (
                <Input value={values[field.key] || ""} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))} placeholder={field.placeholder} />
              )}
              {field.type === 'date' && (
                <Input type="date" value={values[field.key] || ""} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))} />
              )}
              {field.type === 'textarea' && (
                <Textarea value={values[field.key] || ""} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))} placeholder={field.placeholder} className="min-h-[60px]" />
              )}
              {field.type === 'select' && field.options && (
                <Select value={values[field.key] || ""} onValueChange={v => setValues(prev => ({ ...prev, [field.key]: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {field.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" className="bg-gradient-calm border-0 text-primary-foreground" onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
