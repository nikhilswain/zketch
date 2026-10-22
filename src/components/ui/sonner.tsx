import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-center"
      closeButton
      icons={{ success: null, info: null, warning: null, error: null }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "zk-toast",
          content: "zk-toast-content",
          title: "zk-toast-title",
          description: "zk-toast-description",
          actionButton: "zk-toast-action",
          cancelButton: "zk-toast-cancel",
          closeButton: "zk-toast-close",
          icon: "zk-toast-icon",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
