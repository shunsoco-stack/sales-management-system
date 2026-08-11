import Image from "next/image";
import { cn } from "@/components/ui/cn";

export const SALES_MANAGEMENT_SYSTEM_NAME = "売上管理システム";
export const SALES_MANAGEMENT_ICON_PATH = "/icons/sales-management-system.svg";

export interface BrandIconProps {
  className?: string;
  src?: string;
  preload?: boolean;
}

export function BrandIcon({
  className,
  preload = false,
  src = SALES_MANAGEMENT_ICON_PATH,
}: BrandIconProps) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      preload={preload}
      draggable={false}
      className={cn(
        "shrink-0 select-none rounded-[22%] object-cover shadow-sm ring-1 ring-black/[0.06]",
        className,
      )}
    />
  );
}
