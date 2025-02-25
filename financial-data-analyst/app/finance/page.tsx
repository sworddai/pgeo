// app/finance/page.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Send,
  ChevronDown,
  Paperclip,
  ChartLine,
  ChartArea,
  FileInput,
  MessageCircleQuestion,
  ChartColumnBig,
} from "lucide-react";
import FilePreview from "@/components/FilePreview";
import { ChartRenderer } from "@/components/ChartRenderer";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChartData } from "@/types/chart";
import TopNavBar from "@/components/TopNavBar";
import {
  readFileAsText,
  readFileAsBase64,
  readFileAsPDFText,
} from "@/utils/fileHandling";
import type { ReactNode } from "react";

// Types
interface Message {
  id: string;
  role: string;
  content: string;
  hasToolUse?: boolean;
  files?: FileUpload[];
  chartData?: ChartData;
}

type Model = {
  id: string;
  name: string;
};

interface FileUpload {
  base64: string;
  fileName: string;
  mediaType: string;
  isText?: boolean;
  fileSize?: number;
}

const models: Model[] = [
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
  { id: "claude-3-5-sonnet-20240620", name: "Claude 3.5 Sonnet" },
];

// Updated APIResponse interface
interface APIResponse {
  content: string;
  hasToolUse: boolean;
  toolUse?: {
    type: "tool_use";
    id: string;
    name: string;
    input: ChartData;
  };
  chartData?: ChartData;
}

interface MessageComponentProps {
  message: Message;
}

interface ChartPaginationProps {
  total: number;
  current: number;
  onDotClick: (index: number) => void;
}

const SafeChartRenderer: React.FC<{ data: ChartData }> = ({ data }) => {
  try {
    return (
      <div className="w-full h-full p-6 flex flex-col">
        <div className="w-[90%] flex-1 mx-auto">
          <ChartRenderer data={data} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Chart rendering error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return (
      <div className="text-red-500">Error rendering chart: {errorMessage}</div>
    );
  }
};

const MessageComponent: React.FC<MessageComponentProps> = ({ message }) => {
  console.log("Message with chart data:", message); // Add this line for debugging
  return (
    <div className="flex items-start gap-2">
      {message.role === "assistant" && (
        <Avatar className="w-8 h-8 border">
          <AvatarImage
            src="/brain-circuit.svg"
            alt="AI Assistant"
          />
          <AvatarFallback>AI</AvatarFallback>
        </Avatar>
      )}
      <div
        className={`flex flex-col max-w-[75%] ${
          message.role === "user" ? "ml-auto" : ""
        }`}
      >
        <div
          className={`p-3 rounded-md text-base ${
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted border"
          }`}
        >
          {message.content === "thinking" ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2" />
              {message.hasToolUse ? (
                <div className="flex flex-col gap-2">
                  <Badge variant="secondary" className="inline-flex">
                    <ChartLine className="w-4 h-4 mr-1" /> Δημιουργία Γραφήματος
                  </Badge>
                  <span>Σκέφτομαι...</span>
                </div>
              ) : (
                <span>Σκέφτομαι...</span>
              )}
            </div>
          ) : message.role === "assistant" ? (
            <div className="flex flex-col gap-2">
              {message.hasToolUse && (
                <Badge variant="secondary" className="inline-flex px-0">
                  <ChartLine className="w-4 h-4 mr-1" /> Δημιουργία Γραφήματος
                </Badge>
              )}
              <span>{message.content}</span>
            </div>
          ) : (
            <span>{message.content}</span>
          )}
        </div>
        {message.files && message.files.length > 0 && (
          <div className="mt-1.5">
            <div className="flex gap-2 flex-wrap">
              {message.files.map((upload, index) => (
                <FilePreview
                  key={index}
                  file={upload}
                  onRemove={() =>
                    message.files && message.files.length > 0
                      ? message.files.filter((_, i: number) => i !== index)
                      : undefined
                  }
                  size="small"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ChartPagination: React.FC<ChartPaginationProps> = ({
  total,
  current,
  onDotClick,
}) => (
  <div className="fixed right-12 top-1/2 -translate-y-1/2 flex flex-col gap-2">
    {Array.from({ length: total }).map((_, i) => (
      <button
        key={i}
        onClick={() => onDotClick(i)}
        className={`w-2 h-2 rounded-full transition-all ${
          i === current
            ? "bg-primary scale-125"
            : "bg-muted hover:bg-primary/50"
        }`}
      />
    ))}
  </div>
);

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    "claude-3-5-sonnet-20240620",
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chartEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUploads, setCurrentUploads] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentChartIndex, setCurrentChartIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isScrollLocked, setIsScrollLocked] = useState(false);

  useEffect(() => {
    const scrollToBottom = () => {
      if (!messagesEndRef.current) return;

      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    };

    // Scroll when messages change or when loading state changes
    const timeoutId = setTimeout(scrollToBottom, 100);

    return () => clearTimeout(timeoutId);
  }, [messages, isLoading]); // Add isLoading to dependencies

  useEffect(() => {
    if (!messagesEndRef.current) return;

    const observer = new ResizeObserver(() => {
      if (!isScrollLocked) {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }
    });

    observer.observe(messagesEndRef.current);

    return () => observer.disconnect();
  }, [isScrollLocked]);

  const handleChartScroll = useCallback(() => {
    if (!contentRef.current) return;

    const { scrollTop, clientHeight } = contentRef.current;
    const newIndex = Math.round(scrollTop / clientHeight);
    setCurrentChartIndex(newIndex);
  }, []);

  const scrollToChart = (index: number) => {
    if (!contentRef.current) return;

    const targetScroll = index * contentRef.current.clientHeight;
    contentRef.current.scrollTo({
      top: targetScroll,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const scrollToNewestChart = () => {
      const chartsCount = messages.filter((m) => m.chartData).length;
      if (chartsCount > 0) {
        setCurrentChartIndex(chartsCount - 1);
        scrollToChart(chartsCount - 1);
      }
    };

    const lastChartIndex = messages.findLastIndex((m) => m.chartData);
    if (lastChartIndex !== -1) {
      setTimeout(scrollToNewestChart, 100);
    }
  }, [messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      // Process all selected files concurrently
      const uploads: FileUpload[] = await Promise.all(
        Array.from(files).map(async (file: File) => {
          let base64Data = "";
          let isText = false;
          const isImage = file.type.startsWith("image/");
          const isPDF = file.type === "application/pdf";

          if (isImage) {
            base64Data = await readFileAsBase64(file);
            isText = false;
          } else if (isPDF) {
            try {
              const pdfText = await readFileAsPDFText(file);
              base64Data = btoa(encodeURIComponent(pdfText));
              isText = true;
            } catch (error) {
              console.error("Failed to parse PDF:", error);
              toast({
                title: "Αποτυχία ανάγνωσης PDF",
                description: "Δεν ήταν δυνατή η εξαγωγή κειμένου από το PDF",
                variant: "destructive",
              });
              throw error;
            }
          } else {
            try {
              const textContent = await readFileAsText(file);
              base64Data = btoa(encodeURIComponent(textContent));
              isText = true;
            } catch (error) {
              console.error("Failed to read as text:", error);
              toast({
                title: "Μη έγκυρος τύπος αρχείου",
                description: "Το αρχείο πρέπει να είναι αναγνώσιμο ως κείμενο, PDF ή εικόνα",
                variant: "destructive",
              });
              throw error;
            }
          }

          return {
            base64: base64Data,
            fileName: file.name,
            mediaType: isText ? "text/plain" : file.type,
            isText,
            fileSize: file.size,
          };
        })
      );

      // Update state with all uploads
      setCurrentUploads(uploads);
      toast({
        title: "Τα αρχεία μεταφορτώθηκαν",
        description: `${uploads.map((u) => u.fileName).join(", ")} έτοιμα για ανάλυση`,
      });
    } catch (error) {
      console.error("Error processing files:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim() && currentUploads.length === 0) return;
    if (isLoading) return;

    setIsScrollLocked(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      files: currentUploads.length > 0 ? currentUploads : undefined,
    };

    const thinkingMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "thinking",
    };

    // Update messages in a single state update
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setInput("");
    setIsLoading(true);

    // Prepare all messages for the API request
    const apiMessages = [...messages, userMessage].map((msg) => {
      if (msg.files && msg.files.length > 0) {
        // For messages with multiple file attachments,
        // create an array of attachment blocks for each file.
        const attachments = msg.files.map((file) => {
          if (file.isText) {
            const decodedText = decodeURIComponent(atob(file.base64));
            return {
              type: "text",
              text: `File contents of ${file.fileName}:\n\n${decodedText}`,
            };
          } else {
            return {
              type: "image",
              source: {
                type: "base64",
                media_type: file.mediaType,
                data: file.base64,
              },
            };
          }
        });
        // Append the original user message content at the end
        attachments.push({
          type: "text",
          text: msg.content,
        });
        return {
          role: msg.role,
          content: attachments,
        };
      }
      // Text-only message
      return {
        role: msg.role,
        content: msg.content,
      };
    });

    const requestBody = {
      messages: apiMessages,
      model: selectedModel,
    };

    try {
      const response = await fetch("/api/finance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: APIResponse = await response.json();

      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.content,
          hasToolUse: data.hasToolUse || !!data.toolUse,
          chartData:
            data.chartData || (data.toolUse?.input as ChartData) || null,
        };
        return newMessages;
      });

      setCurrentUploads([]);
    } catch (error) {
      console.error("Submit Error:", error);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I apologize, but I encountered an error. Please try again.",
        };
        return newMessages;
      });
    } finally {
      setIsLoading(false);
      setIsScrollLocked(false);

      // Force a final scroll after state updates
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || currentUploads.length > 0) {
        const form = e.currentTarget.form;
        if (form) {
          const submitEvent = new Event("submit", {
            bubbles: true,
            cancelable: true,
          });
          form.dispatchEvent(submitEvent);
        }
      }
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.target;
    setInput(textarea.value);
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
  };

  return (
    <div className="flex flex-col h-screen">
      <TopNavBar
        features={{
          showDomainSelector: false,
          showViewModeSelector: false,
          showPromptCaching: false,
        }}
      />

      <div className="flex-1 flex bg-background p-4 pt-0 gap-4 h-[calc(100vh-4rem)]">
        {/* Chat Sidebar */}
        <Card className="w-1/2 flex flex-col h-full">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {messages.length > 0 && (
                  <>
                    <Avatar className="w-8 h-8 border">
                      <AvatarImage
                        src="/brain-circuit.svg"
                        alt="AI Assistant"
                      />
                      <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">
                        Medical Data Analyst
                      </CardTitle>
                    </div>
                  </>
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-8 text-sm">
                    {models.find((m) => m.id === selectedModel)?.name}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {models.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onSelect={() => setSelectedModel(model.id)}
                    >
                      {model.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 scroll-smooth snap-y snap-mandatory">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full animate-fade-in-up max-w-[95%] mx-auto">
                <Avatar className="w-10 h-10 mb-4 border">
                  <AvatarImage
                    src="/brain-circuit.svg"
                    alt="AI Assistant"
                    width={40}
                    height={40}
                  />
                </Avatar>
                <h2 className="text-xl font-semibold mb-2">
                  Medical Data Analyst
                </h2>
                <div className="space-y-4 text-base">
                  <div className="flex items-center gap-3">
                    <ChartArea className="text-muted-foreground w-6 h-6" />
                    <p className="text-muted-foreground">
                      Μπορώ να αναλύσω ιατρικά δεδομένα και να δημιουργήσω οπτικοποιήσεις
                      από τα αρχεία σας.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <FileInput className="text-muted-foreground w-6 h-6" />
                    <p className="text-muted-foreground">
                      Ανεβάστε αρχεία CSV, PDF ή εικόνες και θα σας βοηθήσω να
                      κατανοήσετε τα ιατρικά δεδομένα.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <MessageCircleQuestion className="text-muted-foreground w-6 h-6" />
                    <p className="text-muted-foreground">
                      Κάντε ερωτήσεις σχετικά με τα ιατρικά σας δεδομένα και θα
                      δημιουργήσω διορατικά γραφήματα.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 min-h-full">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`animate-fade-in-up ${
                      message.content === "thinking" ? "animate-pulse" : ""
                    }`}
                  >
                    <MessageComponent message={message} />
                  </div>
                ))}
                <div ref={messagesEndRef} className="h-4" />{" "}
                {/* Add height to ensure scroll space */}
              </div>
            )}
          </CardContent>

          <CardFooter className="p-4 border-t">
            <form onSubmit={handleSubmit} className="w-full">
              <div className="flex flex-col space-y-2">
                {currentUploads.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {currentUploads.map((upload, index) => (
                      <FilePreview
                        key={index}
                        file={upload}
                        onRemove={() =>
                          setCurrentUploads((prev) => prev.filter((_, i) => i !== index))
                        }
                        size="small"
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-end space-x-2">
                  <div className="flex-1 relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading || isUploading}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Textarea
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Γράψτε το μήνυμά σας..."
                      disabled={isLoading}
                      className="min-h-[44px] h-[44px] resize-none pl-12 py-3 flex items-center"
                      rows={1}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading || (!input.trim() && currentUploads.length === 0)}
                    className="h-[44px]"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={handleFileSelect}
              />
            </form>
          </CardFooter>
        </Card>

        {/* Content Area */}
        <Card className="flex-1 flex flex-col h-full overflow-hidden">
          {messages.some((m) => m.chartData) && (
            <CardHeader className="py-3 px-4 shrink-0">
              <CardTitle className="text-lg">
                Ιατρική Ανάλυση & Οπτικοποιήσεις
              </CardTitle>
            </CardHeader>
          )}
          <CardContent
            ref={contentRef}
            className="flex-1 overflow-y-auto min-h-0 snap-y snap-mandatory"
            onScroll={handleChartScroll}
          >
            {messages.some((m) => m.chartData) ? (
              <div className="min-h-full flex flex-col">
                {messages.map(
                  (message, index) =>
                    message.chartData && (
                      <div
                        key={`chart-${index}`}
                        className="w-full min-h-full flex-shrink-0 snap-start snap-always"
                        ref={
                          index ===
                          messages.filter((m) => m.chartData).length - 1
                            ? chartEndRef
                            : null
                        }
                      >
                        <SafeChartRenderer data={message.chartData} />
                      </div>
                    ),
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="flex flex-col items-center justify-center gap-4 -translate-y-8">
                  <ChartColumnBig className="w-8 h-8 text-muted-foreground" />
                  <div className="space-y-2">
                    <CardTitle className="text-lg">
                      Ιατρική Ανάλυση & Οπτικοποιήσεις
                    </CardTitle>
                    <CardDescription className="text-base">
                      Τα γραφήματα και η λεπτομερής ιατρική ανάλυση θα εμφανιστούν εδώ καθώς συνομιλείτε
                    </CardDescription>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      <Badge variant="outline">Ραβδογράμματα</Badge>
                      <Badge variant="outline">Γραφήματα Περιοχής</Badge>
                      <Badge variant="outline">Γραμμικά Γραφήματα</Badge>
                      <Badge variant="outline">Κυκλικά Διαγράμματα</Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {messages.some((m) => m.chartData) && (
        <ChartPagination
          total={messages.filter((m) => m.chartData).length}
          current={currentChartIndex}
          onDotClick={scrollToChart}
        />
      )}
    </div>
  );
}
