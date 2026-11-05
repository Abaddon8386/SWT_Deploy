package com.swp391.scms.shop.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.shop.service.GeoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/public/geo")
public class PublicGeoController {
    private final GeoService geo;
    private final MessageService messages;

    public PublicGeoController(GeoService geo) {
        this(geo, null);
    }

    @Autowired
    public PublicGeoController(GeoService geo, MessageService messages) {
        this.geo = geo;
        this.messages = messages;
    }

    private String msg(String key) {
        return messages == null ? key : messages.getMessage(key);
    }

    @GetMapping("/provinces")
    public ApiResponse<List<GeoService.Region>> provinces() {
        return ApiResponse.ok(msg("success.shop.geo"), geo.provinces());
    }

    @GetMapping("/provinces/{code}/wards")
    public ApiResponse<List<GeoService.Region>> wards(@PathVariable String code) {
        return ApiResponse.ok(msg("success.shop.geo"), geo.wards(code));
    }
}
