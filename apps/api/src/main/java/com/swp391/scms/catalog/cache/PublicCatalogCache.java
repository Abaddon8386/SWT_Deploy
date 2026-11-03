package com.swp391.scms.catalog.cache;

import com.swp391.scms.catalog.PublicCatalogService.CoachDto;
import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import java.util.List;
import java.util.function.Supplier;

/** Only public, relatively static DTOs belong here. Session times and seats are always live. */
public interface PublicCatalogCache {
    record Snapshot(List<PackageDto> packages, List<CoachDto> coaches) {
        public Snapshot {
            packages = List.copyOf(packages);
            coaches = List.copyOf(coaches);
        }
    }
    Snapshot getOrLoad(Supplier<Snapshot> loader);
    void invalidate();

    static PublicCatalogCache disabled() {
        return new PublicCatalogCache() {
            @Override public Snapshot getOrLoad(Supplier<Snapshot> loader) { return loader.get(); }
            @Override public void invalidate() { }
        };
    }
}
