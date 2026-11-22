"use client";

import { Button } from "@prepora/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@prepora/ui/components/dialog";
import { Input } from "@prepora/ui/components/input";
import { Label } from "@prepora/ui/components/label";
import { toast } from "@prepora/ui/components/sonner";

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join the waitlist</DialogTitle>
          <DialogDescription>
            We&apos;ll email you when Prepora opens in your country.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="dialog-email">Email</Label>
          <Input id="dialog-email" type="email" placeholder="you@example.com" />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <DialogClose
            render={<Button />}
            onClick={() => toast.success("You're on the list")}
          >
            Join
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => toast("Draft saved")}>
        Default toast
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.success("Band 6.5", { description: "Writing Task 2 scored" })}
      >
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error("Not enough credits", { description: "Writing scoring needs 4 credits" })
        }
      >
        Error
      </Button>
    </div>
  );
}
