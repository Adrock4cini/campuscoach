interface Props {
  classId: string;
  className: string;
  variant?: "strip" | "inline";
  wrapperClassName?: string;
}

export function InviteClassmatesButton({
  classId: _classId,
  className: _className,
  variant: _variant,
  wrapperClassName: _wrapperClassName,
}: Props) {
  // Invites are intentionally disabled until the product has a real `/join`
  // route and a tested membership flow. Rendering a share link before then
  // would let a student send classmates to a dead page.
  return null;
}
