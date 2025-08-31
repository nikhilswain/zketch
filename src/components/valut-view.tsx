import type React from "react";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useVaultStore } from "../hooks/useStores";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  Search,
  Grid3X3,
  List,
  Palette,
  HardDrive,
} from "lucide-react";
import { IndexedDBService } from "@/services/IndexedDBService";
import type { ISavedDrawing } from "@/models/VaultModel";
import { toast } from "sonner";

type SortOrder = "name" | "created" | "updated";

interface VaultViewProps {
  onNewDrawing: () => void;
  onEditDrawing: (drawingId: string) => void;
}

const VaultView: React.FC<VaultViewProps> = observer(
  ({ onNewDrawing, onEditDrawing }) => {
    const vaultStore = useVaultStore();
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [sortBy, setSortBy] = useState<"updated" | "created" | "name">(
      "updated"
    );
    const [editingName, setEditingName] = useState<string | null>(null);
    const [newName, setNewName] = useState("");

    const handleDelete = async (drawingId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      await vaultStore.deleteDrawing(drawingId);

      toast.success("Drawing deleted successfully.");
    };

    const handleRename = async (drawingId: string) => {
      if (newName.trim() && newName !== editingName) {
        await vaultStore.renameDrawing(drawingId, newName.trim());
      }
      setEditingName(null);
      setNewName("");
    };

    const startRename = (drawing: ISavedDrawing, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingName(drawing.id);
      setNewName(drawing.name);
    };

    const cancelRename = () => {
      setEditingName(null);
      setNewName("");
    };

    // Filter and sort drawings
    interface FilteredDrawing extends ISavedDrawing {}

    const filteredDrawings: FilteredDrawing[] = vaultStore.sortedDrawings
      .filter((drawing: ISavedDrawing) =>
        drawing.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a: ISavedDrawing, b: ISavedDrawing) => {
        switch (sortBy as SortOrder) {
          case "name":
            return a.name.localeCompare(b.name);
          case "created":
            return b.createdAt.getTime() - a.createdAt.getTime();
          case "updated":
          default:
            return b.updatedAt.getTime() - a.updatedAt.getTime();
        }
      });

    const formatDate = (date: Date) => {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return "Today";
      } else if (diffDays === 1) {
        return "Yesterday";
      } else if (diffDays < 7) {
        return `${diffDays} days ago`;
      } else {
        return date.toLocaleDateString();
      }
    };

    const getStrokeCount = (drawing: ISavedDrawing) => {
      return drawing.strokes.length;
    };

    const getColorCount = (drawing: ISavedDrawing) => {
      const colors = new Set(drawing.strokes.map((stroke) => stroke.color));
      return colors.size;
    };

    if (vaultStore.isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <div className="text-lg text-gray-600">
              Loading your drawings...
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Your Vault
              </h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                <span>
                  {vaultStore.drawings.length} drawing
                  {vaultStore.drawings.length !== 1 ? "s" : ""}
                </span>
                {vaultStore.storageInfo.quota > 0 && (
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-4 h-4" />
                    <span>
                      {IndexedDBService.formatBytes(
                        vaultStore.storageInfo.used
                      )}{" "}
                      used
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={onNewDrawing}
              className="flex items-center gap-2"
              size="lg"
            >
              <Plus className="w-5 h-5" />
              New Drawing
            </Button>
          </div>

          {/* Search and Controls */}
          {!vaultStore.isEmpty && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search drawings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant={viewMode === "grid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid3X3 className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Grid</span>
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">List</span>
                  </Button>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <span className="hidden sm:inline">Sort by </span>
                      {sortBy === "updated"
                        ? "Updated"
                        : sortBy === "created"
                        ? "Created"
                        : "Name"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setSortBy("updated")}>
                      Last Updated
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("created")}>
                      Date Created
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("name")}>
                      Name
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* Empty State */}
          {vaultStore.isEmpty ? (
            <div className="text-center py-16 sm:py-20">
              <div className="text-gray-400 mb-6">
                <div className="w-20 sm:w-24 h-20 sm:h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <Plus className="w-10 sm:w-12 h-10 sm:h-12" />
                </div>
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-700 mb-3">
                No drawings yet
              </h2>
              <p className="text-gray-500 mb-6 sm:mb-8 max-w-md mx-auto px-4">
                Start creating your first digital drawing or signature. Your
                work will be automatically saved here.
              </p>
              <Button onClick={onNewDrawing} size="lg" className="px-6 sm:px-8">
                Create Your First Drawing
              </Button>
            </div>
          ) : filteredDrawings.length === 0 ? (
            <div className="text-center py-16">
              <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-600 mb-2">
                No drawings found
              </h2>
              <p className="text-gray-500">Try adjusting your search terms</p>
            </div>
          ) : (
            /* Gallery */
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6"
                  : "space-y-3"
              }
            >
              {filteredDrawings.map((drawing: ISavedDrawing) => (
                <Card
                  key={drawing.id}
                  className={`cursor-pointer hover:shadow-lg transition-all duration-200 group py-0  ${
                    viewMode === "list" ? "flex p-3 sm:p-4" : ""
                  }`}
                  onClick={() => onEditDrawing(drawing.id)}
                >
                  <CardContent
                    className={
                      viewMode === "grid"
                        ? "p-3 sm:p-4"
                        : "flex items-center gap-3 sm:gap-4 p-0 flex-1"
                    }
                  >
                    {/* Thumbnail */}
                    <div
                      className={`bg-white rounded-lg overflow-hidden border ${
                        viewMode === "grid"
                          ? "aspect-square mb-3"
                          : "w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0"
                      }`}
                    >
                      {drawing.thumbnail ? (
                        <img
                          src={drawing.thumbnail || "/placeholder.svg"}
                          alt={drawing.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                          <Palette className="w-4 sm:w-6 h-4 sm:h-6 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div
                      className={`flex-1 ${
                        viewMode === "grid" ? "" : "min-w-0"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {editingName === drawing.id ? (
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onBlur={() => handleRename(drawing.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleRename(drawing.id);
                                  if (e.key === "Escape") cancelRename();
                                }}
                                className="text-sm h-8"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors text-sm sm:text-base">
                              {drawing.name}
                            </h3>
                          )}

                          <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-gray-500">
                            <span className="meta-info inline-block whitespace-nowrap">
                              {formatDate(drawing.updatedAt)}
                            </span>
                            <span>•</span>
                            <span className="meta-info inline-block whitespace-nowrap">
                              {getStrokeCount(drawing)} strokes
                            </span>
                            {viewMode === "grid" && (
                              <>
                                <span>•</span>
                                <span className="meta-info inline-block whitespace-nowrap">
                                  {getColorCount(drawing)} colors
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => startRename(drawing, e)}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => handleDelete(drawing.id, e)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Additional info for list view */}
                      {viewMode === "list" && (
                        <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs text-gray-400">
                          <span>Created {formatDate(drawing.createdAt)}</span>
                          <span>{getColorCount(drawing)} colors</span>
                          <span>Background: {drawing.background}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default VaultView;
